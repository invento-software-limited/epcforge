// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("Project Budget", {
	refresh(frm) {
		if (!frm.is_new()) {
			render_budget_dashboard(frm);
		}
	},
});

function render_budget_dashboard(frm) {
	const field = frm.get_field("dashboard");
	if (!field) return;

	const currency = frappe.boot?.sysdefaults?.currency || "";
	const fmt = (v) => format_currency(flt(v), currency);

	const health_colors = {
		Green: "var(--green-600)",
		Yellow: "var(--yellow-700)",
		Red: "var(--red-600)",
	};
	const health_color = health_colors[frm.doc.epc_health] || "var(--text-muted)";

	const card = (label, value, color) => `
		<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:14px;">
			<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">${label}</div>
			<div style="font-size:18px;font-weight:700;font-family:'IBM Plex Mono';color:${
				color || "var(--text-color)"
			};">${value}</div>
		</div>`;

	const badge = (label, value, color) => `
		<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:14px;">
			<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">${label}</div>
			<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;color:#fff;background:${color};">${value}</span>
		</div>`;

	const html = `
		<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
			<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px;">
				${card(__("Contract Value"), fmt(frm.doc.contract_value))}
				${card(__("Approved Budget"), fmt(frm.doc.approved_budget))}
				${card(__("Committed"), fmt(frm.doc.committed_amount))}
				${card(__("Actual Cost"), fmt(frm.doc.actual_cost))}
			</div>
			<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px;">
				${card(__("Remaining Budget"), fmt(frm.doc.remaining_budget))}
				${card(
					__("Cost Variance (CV)"),
					fmt(frm.doc.cost_variance),
					flt(frm.doc.cost_variance) >= 0 ? "var(--green-600)" : "var(--red-600)"
				)}
				${card(__("CPI"), flt(frm.doc.cpi).toFixed(2))}
				${card(__("SPI"), flt(frm.doc.epc_spi).toFixed(2))}
			</div>
			<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
				${card(__("Estimate at Completion (EAC)"), fmt(frm.doc.eac))}
				${badge(__("Budget Health"), frm.doc.epc_health || "—", health_color)}
				${badge(__("Schedule Status"), frm.doc.epc_sched_status || "—", "var(--blue-600)")}
			</div>
		</div>`;

	field.html(html);
}
