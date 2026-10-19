// Dashboard tab on the Project Budget form: renders the skeleton into a shadow root, fetches
// one payload from project_budget.budget_dashboard and binds it. Formatting, gauges, charts and
// the stylesheet are the BOQ dashboard's (epcforge.boq_dashboard), loaded before this file.
frappe.provide("epcforge.budget_dashboard");

(() => {
	const ns = epcforge.budget_dashboard;
	const kit = epcforge.boq_dashboard;
	const fmt = kit.format;
	const charts = kit.charts;
	const esc = fmt.esc;
	const METHOD = "epcforge.epcforge.doctype.project_budget.budget_dashboard.get_dashboard_data";
	const HEALTH = { Green: "#0a5a3c", Yellow: "#7a4f12", Red: "#7e2a30" };
	const SCHEDULE = { "On Track": "#0a5a3c", Delayed: "#7a4f12", "Severely Delayed": "#7e2a30", Completed: "#22405e" };
	const LINE_STATUS = { "Not Started": "#3b4757", "Under Budget": "#0a5a3c", "On Track": "#17505d", "Over Budget": "#7e2a30" };
	const HEAD_COLORS = ["#22405e", "#2f5a86", "#17626e", "#8a5a16", "#a3552f", "#5c6672", "#4f77a3", "#0f5a4e"];

	frappe.ui.form.on("Project Budget", {
		refresh(frm) {
			if (frm.is_new() || !frm.get_field("dashboard")) return;
			ns.render(frm);
		},
	});

	ns.render = (frm) => {
		const wrapper = frm.get_field("dashboard").$wrapper[0];
		if (!wrapper) return;
		wrapper.innerHTML = "";
		const host = document.createElement("div");
		host.className = "budget-dashboard";
		wrapper.appendChild(host);
		const root = host.attachShadow({ mode: "open" });
		root.innerHTML = `<style>${kit.CSS}</style>${ns.HTML}`;
		const seq = (frm.__budget_dashboard_seq = (frm.__budget_dashboard_seq || 0) + 1);
		Promise.resolve(frappe.call({ method: METHOD, args: { name: frm.doc.name } }))
			.then((r) => seq === frm.__budget_dashboard_seq && r.message && bind(root, r.message))
			.catch(() => {
				root.querySelector(".cd").innerHTML = `<div class="err">${__("Could not load the budget dashboard.")}</div>`;
			});
	};

	function bind(root, d) {
		fmt.use_currency(d.currency, d.currency_symbol, d.currency_symbol_on_right);
		const $ = (f) => root.querySelector(`[data-field="${f}"]`);
		const text = (f, v) => $(f) && ($(f).textContent = v);
		const slot = (s, html) => (root.querySelector(`[data-slot="${s}"]`).innerHTML = html);
		const pill = (f, label, color) => {
			$(f).textContent = label;
			$(f).style.background = color;
		};
		const share = (v) => (d.budget ? (v / d.budget) * 100 : 0);

		text("asof", __("Live position as of {0}", [fmt.date(d.today)]));
		text("ccy_note", __("Amounts in {0}", [d.currency]));
		text("title", d.project_name || d.name);
		$("meta").innerHTML = [d.name, d.project, d.boq, d.client, d.role, d.discipline].filter(Boolean).map(esc).join(" &nbsp;·&nbsp; ");
		text("hd_budget", fmt.compact(d.budget));
		$("hd_health").innerHTML = d.health ? `<span class="pill" style="background:${HEALTH[d.health]};font-size:13px;padding:4px 12px">${esc(__(d.health))}</span>` : "—";

		fmt.set_compact($("budget"), d.budget);
		text("budget_caption", __("of contract"));
		pill("budget_pill", d.contract_value ? fmt.pct((d.budget / d.contract_value) * 100, 0) : "—", "#3b4757");
		slot("budget_split", charts.segmented(d.heads.map((h, i) => ({ label: h.cost_head, value: h.budget, color: HEAD_COLORS[i % HEAD_COLORS.length] })), false));

		fmt.set_compact($("committed"), d.committed);
		pill("committed_pill", fmt.pct(share(d.committed), 1), "#7a4f12");
		slot("committed_gauge", charts.gauge(share(d.committed), "#8a5a16", [__("{0} PO(s)", [d.heads.reduce((t, h) => t + h.po.length, 0)]), ""]));

		fmt.set_compact($("actual"), d.actual);
		pill("actual_pill", fmt.pct(share(d.actual), 1), d.actual > d.budget ? "#7e2a30" : "#17505d");
		slot("actual_gauge", charts.gauge(share(d.actual), "#17626e", [__("{0} invoice(s)", [d.heads.reduce((t, h) => t + h.pi.length, 0)]),
			__("{0} done", [fmt.pct(d.evm.progress_pct, 0)])], d.evm.progress_pct, __("Marker: project completion")));

		fmt.set_compact($("remaining"), d.remaining);
		pill("remaining_pill", fmt.pct(share(d.remaining), 0), d.remaining < 0 ? "#7e2a30" : "#0a5a3c");
		slot("remaining_split", charts.segmented([{ label: __("Actual"), value: d.actual, color: "#17626e" }, { label: __("Committed"), value: d.committed, color: "#8a5a16" },
			{ label: __("Remaining"), value: Math.max(d.remaining, 0), color: "#c5ccd4" }], false));

		bind_evm(d, text);
		bind_heads(d, root, slot, text);
		bind_performance(d, slot, text);
	}

	function bind_evm(d, text) {
		const e = d.evm;
		text("evm_sub", d.manual_evm ? __("CPI and SPI set manually on the budget") : __("CPI and SPI from project progress"));
		text("pv", fmt.compact(e.planned_value));
		text("pv_s", __("{0} of time elapsed", [fmt.pct(e.planned_pct, 0)]));
		text("ev", fmt.compact(e.earned_value));
		text("ev_s", __("{0} complete · SPI {1}", [fmt.pct(e.progress_pct, 0), d.spi.toFixed(2)]));
		text("ac", fmt.compact(d.actual));
		text("ac_s", __("CPI {0}", [d.cpi.toFixed(2)]));
		text("eac", fmt.compact(d.eac));
		const over = d.eac - d.budget;
		text("eac_s", over > 0 ? __("{0} over budget", [fmt.compact(over)]) : __("{0} under budget", [fmt.compact(-over)]));
	}

	function bind_heads(d, root, slot, text) {
		const heads = d.heads;
		const width = Math.max(root.querySelector('[data-slot="heads_chart"]').clientWidth, 260);
		const chart = kit.page_charts.combo(heads.map((h) => h.cost_head), heads.map((h) => h.budget), heads.map((h) => h.committed + h.actual),
			width, [__("Budget"), __("Committed + actual")]);
		slot("heads_chart", chart.svg || chart);
		text("heads_caption", `${d.currency} ${chart.unit || ""}`.trim());
		const over = heads.filter((h) => h.status === "Over Budget").length;
		text("lines_caption", __("{0} cost head(s)", [heads.length]) + (over ? ` · ${__("{0} over budget", [over])}` : "") + ` · ${__("click a figure to open its documents")}`);
		const link = (value, docs, doctype) => (docs.length && d.can_read[doctype]
			? `<a class="lk" data-doctype="${doctype}" data-names="${esc(JSON.stringify(docs))}" title="${esc(docs.join(", "))}">${esc(fmt.full(value))}</a>`
			: esc(fmt.full(value)));
		slot("lines", heads.map((h) => `<tr>
			<td title="${esc(h.description || "")}">${esc(h.cost_head)}</td>
			<td><span class="pill" style="background:${LINE_STATUS[h.status] || "#3b4757"}">${esc(__(h.status || ""))}</span></td>
			<td class="n">${esc(fmt.full(h.budget))}</td><td class="n doc">${link(h.committed, h.po, "Purchase Order")}</td>
			<td class="n doc">${link(h.actual, h.pi, "Purchase Invoice")}</td>
			<td class="n${h.remaining < 0 ? " cl" : ""}">${esc(fmt.full(h.remaining))}</td><td class="n">${fmt.pct(h.used_pct, 1)}</td></tr>`).join("")
			|| `<tr><td colspan="7" class="empty">${__("No budget lines yet.")}</td></tr>`);
		root.querySelectorAll("a[data-names]").forEach((a) => {
			a.onclick = () => {
				const names = JSON.parse(a.dataset.names);
				if (names.length === 1) return frappe.set_route("Form", a.dataset.doctype, names[0]);
				frappe.set_route("List", a.dataset.doctype, { name: ["in", names] });
			};
		});
	}

	function bind_performance(d, slot, text) {
		text("perf_caption", d.manual_evm ? __("Indices entered manually") : __("Indices from progress"));
		const index = (v) => `<span class="pill" style="background:${v >= 1 ? "#0a5a3c" : v >= 0.85 ? "#7a4f12" : "#7e2a30"}">${v.toFixed(2)}</span>`;
		const rows = [
			[__("Cost performance (CPI)"), index(d.cpi)],
			[__("Schedule performance (SPI)"), index(d.spi)],
			[__("Schedule status"), d.schedule_status ? `<span class="pill" style="background:${SCHEDULE[d.schedule_status] || "#3b4757"}">${esc(__(d.schedule_status))}</span>` : "—"],
			[__("Budget health"), d.health ? `<span class="pill" style="background:${HEALTH[d.health]}">${esc(__(d.health))}</span>` : "—"],
			[__("Contract value"), esc(fmt.compact(d.contract_value))],
			[__("Cost variance"), `<span style="color:${d.cost_variance < 0 ? "#a3302f" : "inherit"}">${esc(fmt.compact(d.cost_variance))}</span>`],
			[__("Project window"), esc(`${fmt.date(d.evm.start)} – ${fmt.date(d.evm.end)}`)],
		];
		slot("performance", rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v}</td></tr>`).join(""));
	}
})();
