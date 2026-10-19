// Lower cards of the BOQ dashboard: cost and margin by item type, the billing schedule,
// procurement by line and the payment milestones table.
frappe.provide("epcforge.boq_dashboard");

epcforge.boq_dashboard.sections = (() => {
	const ns = epcforge.boq_dashboard;
	const fmt = ns.format;
	const esc = fmt.esc;
	const color = (map, key) => (ns.colors[map] || {})[key] || "#5c6672";
	const pill = (text, bg) => `<span class="pill" style="background:${bg}">${esc(text)}</span>`;

	function cost_by_type(d, ctx) {
		const types = d.by_type;
		const chart = ns.page_charts.combo(types.map((t) => __(t.type)), types.map((t) => t.contract), types.map((t) => t.estimated),
			ctx.width("type_chart"), [__("Contract value"), __("Estimated cost")]);
		ctx.slot("type_chart", chart.svg || chart);
		ctx.text("type_caption", __("{0} {1}", [d.currency, chart.unit || ""]).trim());
		ctx.slot("type_rows", types.map((t) => {
			const m = t.margin_pct;
			const bg = m >= 20 ? "#0a5a3c" : m >= 10 ? "#17505d" : m >= 0 ? "#7a4f12" : "#7e2a30";
			return `<tr title="${esc(__("{0} line(s) · estimated {1} · actual {2} · {3} complete", [t.lines, fmt.compact(t.estimated), fmt.compact(t.actual), fmt.pct(t.complete_pct, 0)]))}">
				<td><i style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:8px;background:${color("TYPE_COLORS", t.type)}"></i>${esc(__(t.type))}</td>
				<td class="n">${esc(fmt.compact(t.contract))}</td><td class="n">${pill(fmt.pct(m, 1), bg)}</td></tr>`;
		}).join("") || `<tr><td class="empty">${__("No BOQ lines yet.")}</td></tr>`);
	}

	function schedule(d, ctx) {
		const ms = d.milestones;
		const by = (status) => ms.filter((m) => m.status === status);
		const events = ms.filter((m) => m.target_date).map((m) => ({
			date: m.target_date, color: color("MS_DOTS", m.status), above: m.status !== "Pending",
			title: `${m.milestone} · ${fmt.date(m.target_date)} · ${fmt.compact(m.amount)} · ${__(m.status)}`,
		}));
		ctx.slot("timeline", ns.charts.timeline({
			start: d.start_date, end: d.end_date, today: d.today, events,
			marks: [{ date: d.start_date, label: __("Start"), color: "#22405e" }, { date: d.end_date, label: __("Planned finish"), color: "#a3302f" }],
		}));
		const overdue = ms.filter((m) => m.overdue).length;
		ctx.text("schedule_caption", __("{0} milestone(s)", [ms.length]) + (overdue ? ` · ${__("{0} past target", [overdue])}` : ""));
		const parts = ["Pending", "Invoiced", "Received"].map((s) => ({ label: __(s), value: by(s).reduce((t, m) => t + m.amount, 0), count: by(s).length, color: color("MS_COLORS", s) }));
		const total = parts.reduce((t, p) => t + p.value, 0) || 1;
		ctx.slot("milestone_split", `${ns.charts.segmented(parts, false)}<table class="terms" style="margin-top:12px"><tbody>${parts.map((p) => `<tr>
			<td><i style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:8px;background:${p.color}"></i>${esc(p.label)} · ${p.count}</td>
			<td class="n">${fmt.pct((p.value / total) * 100, 0)}</td><td class="n">${esc(fmt.compact(p.value))}</td></tr>`).join("")}</tbody></table>`);
	}

	function lines(d, ctx) {
		const rows = d.procurement.lines;
		if (!rows.length) return ctx.slot("lines", `<div class="empty">${__("This BOQ has no stock material lines to procure.")}</div>`);
		const bar = (pct, bg, label) => `<div style="display:grid;grid-template-columns:64px 1fr 40px;gap:8px;align-items:center;font-size:10.5px;color:var(--mid)">
			<span>${esc(label)}</span><div class="rk-t"><div class="rk-f" style="width:${Math.max(Math.min(pct, 100), pct > 0 ? 2 : 0)}%;background:${bg}"></div></div>
			<span style="text-align:right;color:var(--ink);font-weight:600">${fmt.pct(pct, 0)}</span></div>`;
		ctx.slot("lines", rows.map((l) => `<div>
			<div class="rk-r"><span class="rk-d" style="background:#17626e"></span><span class="rk-n" title="${esc(l.description)}">${esc(l.item_code)}</span>
			<span class="rk-v">${fmt.qty(l.qty)} ${esc(l.uom)}<em> · ${esc(fmt.compact(l.value))}</em></span></div>
			<div style="display:flex;flex-direction:column;gap:5px">
				${bar(l.mr_pct, "#2f5a86", __("Requested"))}${bar(l.po_pct, "#8a5a16", __("Ordered"))}${bar(l.pr_pct, "#097C52", __("Received"))}
			</div></div>`).join(""));
	}

	function milestones(d, ctx) {
		const ms = d.milestones;
		const gaps = ms.filter((m) => m.unlinked).length;
		ctx.text("ms_caption", __("{0} milestone(s) · {1} to bill", [ms.length, fmt.compact(d.contract_value - d.billed)])
			+ (gaps ? ` · ${__("{0} marked billed without an invoice", [gaps])}` : ""));
		if (!ms.length) return ctx.slot("milestones", `<tr><td colspan="7" class="empty">${__("No payment milestones on this BOQ.")}</td></tr>`);
		ctx.slot("milestones", ms.map((m) => {
			const invoice = m.sales_invoice
				? `<a class="lk" data-doctype="Sales Invoice" data-name="${esc(m.sales_invoice)}">${esc(m.sales_invoice)}</a>`
				: m.unlinked ? pill(__("not linked"), "#7e2a30") : "—";
			const name = m.task ? `<a class="lk" data-doctype="Task" data-name="${esc(m.task)}">${esc(m.milestone)}</a>` : esc(m.milestone);
			const late = m.overdue ? ` ${pill(__("past target"), "#7e2a30")}` : "";
			return `<tr><td class="doc">${name}</td><td>${esc(fmt.date(m.target_date))}${late}</td>
				<td>${pill(__(m.status), color("MS_COLORS", m.status))}</td><td class="doc">${invoice}</td>
				<td class="n">${fmt.pct(m.percent, 0)}</td><td class="n">${esc(fmt.full(m.amount))}</td><td class="n">${esc(fmt.full(m.net_payable))}</td></tr>`;
		}).join(""));
	}

	return { cost_by_type, schedule, lines, milestones };
})();
