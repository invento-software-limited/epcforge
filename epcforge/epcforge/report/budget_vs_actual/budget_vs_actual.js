// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt

// Header above the table: KPI cards and charts from this report's own rows (epc_report/kit.js).
const epc_report_header = (report, build) =>
	frappe.require("/assets/epcforge/js/epc_report/loader.js", () =>
		epcforge.report_kit_ready.then((kit) => kit.render(report, (meta) => build(meta, kit)))
	);

frappe.query_reports["Budget vs Actual"] = {
	after_refresh(report) {
		epc_report_header(report, budget_vs_actual_header);
	},
	filters: [
		{
			fieldname: "project",
			label: __("Project"),
			fieldtype: "Link",
			options: "Project",
		},
		{
			fieldname: "cost_head",
			label: __("Cost Head"),
			fieldtype: "Link",
			options: "Budget Cost Head",
		},
	],
};

function budget_vs_actual_header(m, kit) {
	const share = (v) => (m.budget ? (v / m.budget) * 100 : 0);
	const heads = m.heads;
	const chart = kit.bars({ series: { labels: heads.map((h) => h.key), values: heads.map((h) => h.value), args: heads.map((h) => h.key) },
		line: { values: heads.map((h) => h.committed + h.actual) }, act: "cost_head", names: [__("Budget"), __("Used")] });
	const cards = [
		kit.card({ k: __("Budget"), v: kit.money(m.budget), pill: [__("{0} budget(s)", [m.budgets]), "#3b4757"], sub: __("{0} cost head(s)", [heads.length]),
			visual: kit.seg_bar(heads.slice(0, 6).map((h, i) => ({ label: h.key, value: h.value, color: ["#22405e", "#2f5a86", "#17626e", "#8a5a16", "#a3552f", "#5c6672"][i] }))) }),
		kit.card({ k: __("Committed"), v: kit.money(m.committed), pill: [kit.fmt.pct(share(m.committed), 1), "#7a4f12"], sub: __("of budget, on order"),
			visual: kit.mini.gauge(share(m.committed), "#8a5a16", [__("ordered, not yet booked"), ""]) }),
		kit.card({ k: __("Actual"), v: kit.money(m.actual), pill: [kit.fmt.pct(share(m.actual), 1), "#17505d"], sub: __("of budget, booked"),
			visual: kit.mini.gauge(share(m.actual), "#17626e", [__("spent"), ""]) }),
		kit.card({ k: __("Remaining"), tint: true, v: kit.money(m.remaining), pill: [__("{0} used", [kit.fmt.pct(m.used_pct, 1)]), m.used_pct > 100 ? "#7e2a30" : m.used_pct > 80 ? "#7a4f12" : "#0a5a3c"],
			sub: __("committed + actual"), visual: kit.seg_bar([{ label: __("Actual"), value: m.actual, color: "#17626e" }, { label: __("Committed"), value: m.committed, color: "#8a5a16" }, { label: __("Remaining"), value: Math.max(m.remaining, 0), color: "#c5ccd4" }]) }),
	];
	return {
		html: `<div class="mx surf">${cards.join("")}</div>
			<div class="surf card"><div class="two">
				<div><div class="hrow"><div class="h">${__("Budget vs used by cost head")}</div><div class="hs">${kit.esc(kit.subtitle(m, chart.unit))}</div></div>${chart.svg}
					<div class="lgd"><span><i style="background:#097C52"></i>${__("Budget")}</span><span><i style="background:#a3552f;height:2px"></i>${__("Committed + actual")}</span></div></div>
				<div><div class="hrow"><div class="h">${__("Most used cost heads")}</div><div class="hs">${__("Share of budget used · click to filter")}</div></div>
					${kit.rank([...heads].sort((a, b) => b.used_pct - a.used_pct).slice(0, 6).map((h) => ({ label: h.key, value: h.committed + h.actual, sub: kit.fmt.pct(h.used_pct, 1), act: "cost_head", arg: h.key })))}
					<div class="hrow" style="margin-top:18px"><div class="h">${__("By project")}</div><div class="hs">${__("Budget · click to filter")}</div></div>
					${kit.composition(m.projects.map((p, i) => ({ label: p.key, value: p.value, count: p.count, color: ["#22405e", "#17626e", "#8a5a16", "#a3552f"][i % 4], act: "project", arg: p.key })))}</div>
			</div></div>`,
		actions: {
			cost_head: (cost_head, report) => kit.set_filters(report, { cost_head }),
			project: (project, report) => kit.set_filters(report, { project }),
		},
	};
}
