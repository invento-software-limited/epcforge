// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt

// Header above the table: KPI cards and charts from this report's own rows (epc_report/kit.js).
const epc_report_header = (report, build) =>
	frappe.require("/assets/epcforge/js/epc_report/loader.js", () =>
		epcforge.report_kit_ready.then((kit) => kit.render(report, (meta) => build(meta, kit)))
	);

frappe.query_reports["BOQ Summary"] = {
	after_refresh(report) {
		epc_report_header(report, boq_summary_header);
	},
	filters: [
		{
			fieldname: "project",
			label: __("Project"),
			fieldtype: "Link",
			options: "Project",
		},
		{
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			options: "\nDraft\nSubmitted\nApproved\nCancelled",
		},
	],
};

const EPC_STATUS_COLORS = {
	Draft: "#3b4757", Submitted: "#22405e", Approved: "#0a5a3c", Cancelled: "#7e2a30", Published: "#22405e",
	"Under Evaluation": "#7a4f12", Awarded: "#0a5a3c",
};

function boq_summary_header(m, kit) {
	const burn = m.estimated ? (m.actual / m.estimated) * 100 : 0;
	const margin = m.margin_pct;
	const per = m.per_boq;
	const chart = kit.bars({ series: { labels: per.map((b) => b.name), values: per.map((b) => b.contract), args: per.map((b) => b.name) },
		line: { values: per.map((b) => b.estimated) }, act: "boq", names: [__("Contract"), __("Estimated")] });
	const statuses = m.statuses.map((s) => ({ label: __(s.key), value: s.value, count: s.count, color: EPC_STATUS_COLORS[s.key] || "#5c6672", act: "status", arg: s.key }));
	const cards = [
		kit.card({ k: __("BOQs"), v: kit.count(m.boqs), pill: [__("{0} approved", [(m.statuses.find((s) => s.key === "Approved") || {}).count || 0]), "#0a5a3c"],
			sub: m.cancelled ? __("{0} cancelled not counted", [m.cancelled]) : __("in this view"), visual: kit.seg_bar(statuses) }),
		kit.card({ k: __("Contract value"), v: kit.money(m.contract), sub: __("total selling amount"),
			visual: kit.seg_bar(per.map((b, i) => ({ label: b.name, value: b.contract, color: ["#22405e", "#2f5a86", "#4f77a3", "#7d9cc0", "#aabfd6"][i % 5] }))) }),
		kit.card({ k: __("Estimated cost"), v: kit.money(m.estimated), pill: [kit.fmt.pct(margin, 1), margin >= 20 ? "#0a5a3c" : margin >= 10 ? "#17505d" : margin >= 0 ? "#7a4f12" : "#7e2a30"],
			sub: __("planned margin"), visual: kit.mini.gauge(m.contract ? (m.estimated / m.contract) * 100 : 0, "#2f5a86", [__("of contract value"), ""]) }),
		kit.card({ k: __("Actual cost to date"), tint: true, v: kit.money(m.actual), pill: [kit.fmt.pct(burn, 1), burn > 100 ? "#7e2a30" : "#17505d"],
			sub: __("of estimate"), visual: kit.mini.gauge(burn, burn > 100 ? "#a3302f" : "#17626e", [__("{0} left", [kit.fmt.compact(m.estimated - m.actual)]), ""]) }),
	];
	return {
		html: `<div class="mx surf">${cards.join("")}</div>
			<div class="surf card"><div class="two">
				<div><div class="hrow"><div class="h">${__("Contract vs estimated cost")}</div><div class="hs">${kit.esc(kit.subtitle(m, chart.unit))}</div></div>${chart.svg}
					<div class="lgd"><span><i style="background:#097C52"></i>${__("Contract value")}</span><span><i style="background:#a3552f;height:2px"></i>${__("Estimated cost")}</span></div></div>
				<div><div class="hrow"><div class="h">${__("By status")}</div><div class="hs">${__("Click to filter the table")}</div></div>${kit.composition(statuses)}
					<div class="hrow" style="margin-top:18px"><div class="h">${__("Margin by BOQ")}</div><div class="hs">${__("Planned")}</div></div>
					${kit.rank(per.map((b) => ({ label: `${b.name} · ${b.project || ""}`, value: b.contract, sub: kit.fmt.pct(b.margin_pct, 1), act: "boq", arg: b.name })))}</div>
			</div></div>`,
		actions: {
			status: (status, report) => kit.set_filters(report, { status }),
			boq: (name) => frappe.set_route("Form", "BOQ", name),
		},
	};
}
