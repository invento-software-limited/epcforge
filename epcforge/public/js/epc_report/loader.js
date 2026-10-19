// Loads the EPCForge report header kit once per session. A report calls
//   frappe.require("/assets/epcforge/js/epc_report/loader.js", () => epcforge.report_kit_ready.then(...))
// The pieces load one at a time because each reads the namespaces the ones before it define.
frappe.provide("epcforge");

epcforge.report_kit_ready =
	epcforge.report_kit_ready ||
	[
		"/assets/epcforge/js/boq_dashboard/format.js",
		"/assets/epcforge/js/boq_dashboard/charts.js",
		"/assets/epcforge/js/boq_dashboard/page_charts.js",
		"/assets/epcforge/js/boq_dashboard/styles.js",
		"/assets/epcforge/js/epc_report/kit.js",
	]
		.reduce((chain, src) => chain.then(() => new Promise((done) => frappe.require(src, done))), Promise.resolve())
		.then(() => epcforge.report_kit);
