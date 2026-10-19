// Dashboard tab on the BOQ form: renders the skeleton into a shadow root, fetches one
// payload from epcforge.epcforge.doctype.boq.boq_dashboard and binds it.
frappe.provide("epcforge.boq_dashboard");

(() => {
	const ns = epcforge.boq_dashboard;
	const fmt = ns.format;
	const charts = ns.charts;
	const METHOD = "epcforge.epcforge.doctype.boq.boq_dashboard.get_dashboard_data";
	const TYPE_COLORS = { Equipment: "#22405e", Material: "#17626e", Subcontract: "#8a5a16", Labour: "#a3552f", Overhead: "#5c6672" };
	const MS_COLORS = { Pending: "#22405e", Invoiced: "#7a4f12", Received: "#0a5a3c" };
	const MS_DOTS = { Pending: "#2f5a86", Invoiced: "#8a5a16", Received: "#097C52" };

	frappe.ui.form.on("BOQ", {
		refresh(frm) {
			if (frm.is_new() || !frm.get_field("dashboard")) return;
			ns.render(frm);
		},
	});

	ns.render = (frm) => {
		const wrapper = frm.get_field("dashboard").$wrapper[0];
		if (!wrapper) return;
		const root = mount(wrapper);
		const seq = (frm.__boq_dashboard_seq = (frm.__boq_dashboard_seq || 0) + 1);
		Promise.resolve(frappe.call({ method: METHOD, args: { name: frm.doc.name } }))
			.then((r) => seq === frm.__boq_dashboard_seq && r.message && bind(root, r.message))
			.catch(() => {
				root.querySelector(".cd").innerHTML = `<div class="err">${__("Could not load the BOQ dashboard.")}</div>`;
			});
	};

	function mount(wrapper) {
		wrapper.innerHTML = "";
		const host = document.createElement("div");
		host.className = "boq-dashboard";
		wrapper.appendChild(host);
		const root = host.attachShadow({ mode: "open" });
		root.innerHTML = `<style>${ns.CSS}</style>${ns.HTML}`;
		return root;
	}

	function bind(root, d) {
		fmt.use_currency(d.currency, d.currency_symbol, d.currency_symbol_on_right);
		const $ = (field) => root.querySelector(`[data-field="${field}"]`);
		const ctx = {
			root, $,
			text: (field, value) => $(field) && ($(field).textContent = value),
			slot: (name, html) => (root.querySelector(`[data-slot="${name}"]`).innerHTML = html),
			width: (name) => Math.max(root.querySelector(`[data-slot="${name}"]`).clientWidth, 260),
		};
		bind_header(d, ctx);
		bind_metrics(d, ctx);
		bind_procurement(d, ctx);
		const s = ns.sections;
		[s.cost_by_type, s.schedule, s.lines, s.milestones].forEach((fn) => fn(d, ctx));
		bind_drills(root, d);
	}

	function bind_header(d, { $, text }) {
		text("asof", __("Position as of {0}", [fmt.date(d.today)]));
		text("ccy_note", __("Amounts in {0}", [d.currency]));
		text("title", d.project_name || d.name);
		const meta = [d.project_name ? d.name : null, d.project, d.contract_type, __("Rev. {0}", [d.revision])].filter(Boolean).map(fmt.esc);
		meta.push(`<b>${fmt.esc(__(d.status || ""))}</b>`);
		$("meta").innerHTML = meta.join(" &nbsp;·&nbsp; ");
		text("hd_contract", fmt.compact(d.contract_value));
		text("hd_margin", fmt.pct(d.gross_margin_pct, 1));
	}

	function bind_metrics(d, { $, text, slot }) {
		const share = (v) => (d.contract_value ? (v / d.contract_value) * 100 : 0);
		fmt.set_compact($("contract"), d.contract_value);
		pill($("contract_pill"), __("{0} line(s)", [d.line_count]), "#3b4757");
		text("contract_caption", __("{0} item type(s)", [d.by_type.length]));
		slot("contract_split", charts.segmented(d.by_type.map((t) => ({ label: __(t.type), value: t.contract, color: TYPE_COLORS[t.type] || "#5c6672" })), false));

		fmt.set_compact($("estimated"), d.estimated_cost);
		const m = d.gross_margin_pct;
		pill($("margin_pill"), fmt.pct(m, 1), m >= 20 ? "#0a5a3c" : m >= 10 ? "#17505d" : m >= 0 ? "#7a4f12" : "#7e2a30");
		slot("estimated_gauge", charts.gauge(share(d.estimated_cost), "#2f5a86",
			[__("{0} of contract", [fmt.pct(share(d.estimated_cost), 0)]), ""], null,
			__("Planned margin {0}", [fmt.compact(d.contract_value - d.estimated_cost)])));

		fmt.set_compact($("actual"), d.actual_cost);
		const burn = d.estimated_cost ? (d.actual_cost / d.estimated_cost) * 100 : 0;
		pill($("burn_pill"), fmt.pct(burn, 1), burn > 100 ? "#7e2a30" : burn > d.project_complete ? "#7a4f12" : "#17505d");
		slot("actual_gauge", charts.gauge(burn, burn > 100 ? "#a3302f" : "#17626e",
			[__("{0} left", [fmt.compact(d.budget_variance)]), __("{0} done", [fmt.pct(d.project_complete, 0)])],
			d.project_complete, __("Marker: project completion {0}", [fmt.pct(d.project_complete, 0)])));

		fmt.set_compact($("billed"), d.billed);
		const billed_pct = share(d.billed);
		pill($("billed_pill"), fmt.pct(billed_pct, 0), billed_pct > 0 ? "#0a5a3c" : "#3b4757");
		text("billed_caption", __("of contract"));
		$("billed_caption").title = __("{0} received", [fmt.compact(d.received)]);
		slot("billed_gauge", charts.gauge(billed_pct, "#097C52", [__("{0} to bill", [fmt.compact(d.contract_value - d.billed)]), ""]));
	}

	function bind_procurement(d, { text }) {
		const p = d.procurement;
		text("st_value", fmt.compact(p.value));
		text("st_value_s", __("{0} stock line(s)", [p.lines.length]));
		const stage = (key, value, pct, docs, label) => {
			text(`st_${key}`, fmt.compact(value));
			text(`st_${key}_s`, __("{0} · {1} {2}", [fmt.pct(pct, 0), docs, label]));
		};
		stage("mr", p.requested, p.requested_pct, p.documents.mr.length, __("request(s)"));
		stage("po", p.ordered, p.ordered_pct, p.documents.po.length, __("order(s)"));
		stage("pr", p.received, p.received_pct, p.documents.pr.length, __("receipt(s)"));
	}

	function bind_drills(root, d) {
		const lists = { mr: "Material Request", po: "Purchase Order", pr: "Purchase Receipt" };
		root.querySelectorAll("[data-drill]").forEach((el) => {
			const doctype = lists[el.dataset.drill];
			const names = d.procurement.documents[el.dataset.drill] || [];
			if (!names.length || !d.can_read[doctype]) return el.classList.remove("lk");
			el.title = names.length === 1 ? names[0] : __("Open {0} list", [__(doctype)]);
			el.onclick = () => open_documents(doctype, names, d.project);
		});
		root.querySelectorAll("[data-doctype][data-name]").forEach((a) => {
			a.onclick = () => frappe.set_route("Form", a.dataset.doctype, a.dataset.name);
		});
	}

	// One document opens its form; several open the list. EPCForge narrows lists to the
	// user's active project, so say so when that is not this BOQ's project.
	function open_documents(doctype, names, project) {
		if (names.length === 1) return frappe.set_route("Form", doctype, names[0]);
		const active = frappe.defaults.get_user_default("project");
		if (active && project && active !== project) {
			frappe.show_alert({ message: __("Your active project is {0}; switch to {1} to see all of this BOQ's documents.", [active, project]), indicator: "orange" }, 7);
		}
		frappe.set_route("List", doctype, { name: ["in", names] });
	}

	function pill(el, label, color) {
		if (!el) return;
		el.textContent = label;
		el.style.background = color;
	}

	ns.colors = { TYPE_COLORS, MS_COLORS, MS_DOTS };
})();
