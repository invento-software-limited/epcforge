// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt

// Header above the table: KPI cards and charts from this report's own rows (epc_report/kit.js).
const epc_report_header = (report, build) =>
	frappe.require("/assets/epcforge/js/epc_report/loader.js", () =>
		epcforge.report_kit_ready.then((kit) => kit.render(report, (meta) => build(meta, kit)))
	);

frappe.query_reports["Tender Summary"] = {
	after_refresh(report) {
		epc_report_header(report, tender_summary_header);
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
			options: "\nDraft\nPublished\nUnder Evaluation\nAwarded\nCancelled",
		},
		{
			fieldname: "tender_type",
			label: __("Tender Type"),
			fieldtype: "Select",
			options: "\nOpen Tender\nLimited Tender\nSingle Tender\nNegotiated\nRequest for Proposal (RFP)\nRequest for Quotation (RFQ)",
		},
		{
			fieldname: "from_date",
			label: __("From Publish Date"),
			fieldtype: "Date",
		},
		{
			fieldname: "to_date",
			label: __("To Publish Date"),
			fieldtype: "Date",
		},
	],
};

const TENDER_STATUS_COLORS = { Draft: "#3b4757", Published: "#22405e", "Under Evaluation": "#7a4f12", Awarded: "#0a5a3c", Cancelled: "#7e2a30" };

function tender_summary_header(m, kit) {
	const avg = m.tenders ? m.bidders / m.tenders : 0;
	const statuses = m.statuses.map((s) => ({ label: __(s.key), value: s.value, count: s.count, color: TENDER_STATUS_COLORS[s.key] || "#5c6672", act: "status", arg: s.key }));
	const types = m.types.map((t, i) => ({ label: __(t.key), value: t.value, count: t.count, color: ["#22405e", "#17626e", "#8a5a16", "#a3552f", "#5c6672", "#2f5a86"][i % 6], act: "tender_type", arg: t.key }));
	const vs = m.award_vs_estimate_pct;
	const cards = [
		kit.card({ k: __("Tenders"), v: kit.count(m.tenders), pill: [__("{0} open", [m.open]), m.open ? "#7a4f12" : "#3b4757"], sub: __("published or under evaluation"),
			visual: kit.seg_bar(statuses) }),
		kit.card({ k: __("Bidders"), v: kit.count(m.bidders), pill: [__("{0} per tender", [avg.toFixed(1)]), "#17505d"], sub: __("across these tenders"),
			visual: kit.mini.bar_sparkline(m.bidders_per_tender.map((t) => t.bidders), m.bidders_per_tender.map(() => "#2f5a86")) }),
		kit.card({ k: __("Estimated value"), v: kit.money(m.estimated), sub: __("of tenders in view"), visual: kit.seg_bar(types) }),
		kit.card({ k: __("Awarded value"), tint: true, v: kit.money(m.award_value), act: "status", arg: "Awarded",
			pill: [m.awarded_count ? __("{0} of estimate", [kit.fmt.pct(vs, 0)]) : __("none yet"), vs && vs <= 100 ? "#0a5a3c" : vs > 100 ? "#7e2a30" : "#3b4757"],
			sub: __("{0} awarded", [m.awarded_count]), visual: kit.mini.gauge(vs, vs > 100 ? "#a3302f" : "#097C52", [__("award vs estimate"), "100%"]) }),
	];
	return {
		html: `<div class="mx surf">${cards.join("")}</div>
			<div class="surf card"><div class="two">
				<div><div class="hrow"><div class="h">${__("By status")}</div><div class="hs">${__("Estimated value · click to filter")}</div></div>${kit.composition(statuses)}</div>
				<div><div class="hrow"><div class="h">${__("By tender type")}</div><div class="hs">${__("Estimated value · click to filter")}</div></div>${kit.composition(types)}</div>
			</div></div>`,
		actions: {
			status: (status, report) => kit.set_filters(report, { status }),
			tender_type: (tender_type, report) => kit.set_filters(report, { tender_type }),
		},
	};
}
