// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt

frappe.pages["project-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Project Dashboard"),
		single_column: true,
	});

	const project_field = page.add_field({
		label: __("Project"),
		fieldtype: "Link",
		options: "Project",
		fieldname: "project",
		change() {
			const val = project_field.get_value();
			if (val) load_dashboard(page, val);
		},
	});

	page.add_inner_button(__("Refresh"), () => {
		const val = project_field.get_value();
		if (val) load_dashboard(page, val);
	});

	frappe.call({
		method: "epcforge.epcforge.page.project_dashboard.project_dashboard.get_projects_list",
		callback(r) {
			const projects = r.message || [];
			const active = projects.find((p) => p.is_active) || projects[0];
			if (active) {
				project_field.set_value(active.value);
			} else {
				$(page.body).html(
					`<div style="padding:40px;text-align:center;color:var(--text-muted);">${__(
						"No projects found."
					)}</div>`
				);
			}
		},
	});
};

let pd_charts = {};

function load_dashboard(page, project_id) {
	$(page.body).html(
		`<div style="padding:40px;text-align:center;color:var(--text-muted);">${__(
			"Loading..."
		)}</div>`
	);

	frappe.call({
		method: "epcforge.epcforge.page.project_dashboard.project_dashboard.get_dashboard_data",
		args: { project_id },
		callback(r) {
			if (!r.message) return;
			render_dashboard(page, r.message);
		},
		error() {
			$(page.body).html(
				`<div style="padding:40px;text-align:center;color:var(--red-600);">${__(
					"Could not load the dashboard for this project."
				)}</div>`
			);
		},
	});
}

function render_dashboard(page, data) {
	$(page.body).html(build_layout(data));

	if (!data.boq) return;

	load_chartjs(() => {
		render_procurement_charts(data.procurement);
		render_cost_type_chart(data.cost_by_type);
		render_cost_head_chart(data.cost_by_head);
		render_payment_chart(data.payment_milestones.kpis);
		render_phase_chart(data.phase_progress);
	});
}

function load_chartjs(cb) {
	if (window.Chart) {
		cb();
		return;
	}
	const s = document.createElement("script");
	s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
	s.onload = cb;
	document.head.appendChild(s);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function build_layout(data) {
	const { project, budget, boq, currency } = data;
	const symbol = currency_symbol(currency);

	if (!boq) {
		return `
			<div style="padding:24px;">
				${section_title(project.project_name || "")}
				<div style="padding:40px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:8px;">
					${__("This project doesn't have a BOQ yet.")}
				</div>
			</div>`;
	}

	const health_colors = {
		Green: "var(--green-600)",
		Yellow: "var(--yellow-700)",
		Red: "var(--red-600)",
	};
	const health = budget ? budget.epc_health : null;
	const health_color = health_colors[health] || "var(--text-muted)";

	return `
		<div style="padding:24px;">
			${section_title(project.project_name || "")}

			<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
				${kpi_card(__("Contract Value"), symbol + fmt_val(boq.total_amount))}
				${kpi_badge(__("Budget Health"), health || "—", health_color)}
				${kpi_badge(__("Schedule Status"), (budget && budget.epc_sched_status) || "—", "var(--blue-600)")}
				${kpi_card(__("Project Complete"), flt2(project.percent_complete) + "%")}
			</div>
			<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;">
				${kpi_card(__("CPI"), budget ? flt2(budget.cpi) : "—")}
				${kpi_card(__("SPI"), budget ? flt2(budget.epc_spi) : "—")}
				${kpi_card(__("Estimate at Completion"), budget ? symbol + fmt_val(budget.eac) : "—")}
				${kpi_card(
					__("Cost Variance"),
					budget ? symbol + fmt_val(budget.cost_variance) : "—",
					budget && budget.cost_variance < 0 ? "var(--red-600)" : "var(--green-600)"
				)}
			</div>

			<div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px;">
				${chart_card(__("Procurement Coverage by Item"), "pd-chart-procurement")}
				${chart_card(__("Procurement Split"), "pd-chart-procurement-split")}
			</div>
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
				${chart_card(__("Cost by Item Type"), "pd-chart-cost-type")}
				${chart_card(__("Budget by Cost Head"), "pd-chart-cost-head")}
			</div>
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
				${chart_card(__("Payment Milestones"), "pd-chart-payment")}
				${chart_card(__("Phase Progress"), "pd-chart-phase")}
			</div>

			${milestone_table(data.payment_milestones.rows, symbol)}
		</div>`;
}

function section_title(project_name) {
	return `<div style="font-size:16px;font-weight:700;color:var(--text-color);margin-bottom:16px;">${frappe.utils.escape_html(
		project_name
	)}</div>`;
}

function kpi_card(label, value, color) {
	return `
		<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:14px;">
			<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">${label}</div>
			<div style="font-size:18px;font-weight:700;font-family:'IBM Plex Mono';color:${
				color || "var(--text-color)"
			};">${value}</div>
		</div>`;
}

function kpi_badge(label, value, color) {
	return `
		<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:14px;">
			<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">${label}</div>
			<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;color:#fff;background:${color};">${value}</span>
		</div>`;
}

function chart_card(title, canvas_id) {
	return `
		<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:16px;">
			<div style="font-size:12.5px;font-weight:700;color:var(--text-color);margin-bottom:12px;">${title}</div>
			<canvas id="${canvas_id}" style="max-height:260px;"></canvas>
		</div>`;
}

function milestone_table(rows, symbol) {
	if (!rows || !rows.length) return "";

	const status_colors = {
		Pending: "background-color:var(--gray-100);color:var(--gray-700);",
		Invoiced: "background-color:var(--yellow-100);color:var(--yellow-800);",
		Received: "background-color:var(--green-100);color:var(--green-800);",
	};

	let body = "";
	rows.forEach((m) => {
		const style = status_colors[m.payment_status] || status_colors.Pending;
		const invoice = m.sales_invoice
			? `<a href="/app/sales-invoice/${m.sales_invoice}">${m.sales_invoice}</a>`
			: "—";
		body += `
			<tr style="border-bottom:1px solid var(--border-color);">
				<td style="padding:8px 10px;font-weight:600;">${frappe.utils.escape_html(m.milestone || "")}</td>
				<td style="padding:8px 10px;color:var(--text-muted);">${m.target_date || "—"}</td>
				<td style="padding:8px 10px;text-align:right;font-family:'IBM Plex Mono';">${
					m.percent_amount
				}%</td>
				<td style="padding:8px 10px;text-align:right;font-family:'IBM Plex Mono';">${symbol}${fmt_val(
			m.net_payable
		)}</td>
				<td style="padding:8px 10px;">${invoice}</td>
				<td style="padding:8px 10px;text-align:center;">
					<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase;${style}">${
			m.payment_status
		}</span>
				</td>
			</tr>`;
	});

	return `
		<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:16px;overflow-x:auto;">
			<div style="font-size:12.5px;font-weight:700;color:var(--text-color);margin-bottom:12px;">${__(
				"Milestone Schedule"
			)}</div>
			<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:560px;">
				<thead>
					<tr style="background:var(--subtle-fg);">
						<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);">${__(
							"Milestone"
						)}</th>
						<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);">${__(
							"Due"
						)}</th>
						<th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:var(--text-muted);">%</th>
						<th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:var(--text-muted);">${__(
							"Net Payable"
						)}</th>
						<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);">${__(
							"Invoice"
						)}</th>
						<th style="padding:8px 10px;text-align:center;font-size:10px;text-transform:uppercase;color:var(--text-muted);">${__(
							"Status"
						)}</th>
					</tr>
				</thead>
				<tbody>${body}</tbody>
			</table>
		</div>`;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function destroy(id) {
	if (pd_charts[id]) {
		pd_charts[id].destroy();
		delete pd_charts[id];
	}
}

function render_procurement_charts(procurement) {
	const items = (procurement.items || []).slice(0, 10);
	const ctx1 = document.getElementById("pd-chart-procurement");
	if (ctx1 && items.length) {
		destroy("procurement");
		pd_charts["procurement"] = new Chart(ctx1, {
			type: "bar",
			data: {
				labels: items.map((i) => (i.item_code || "").substring(0, 20)),
				datasets: [
					{
						label: "MR %",
						data: items.map((i) => i.mr_pct),
						backgroundColor: "rgba(15,61,107,0.75)",
					},
					{
						label: "PO %",
						data: items.map((i) => i.po_pct),
						backgroundColor: "rgba(138,92,0,0.75)",
					},
					{
						label: "GR %",
						data: items.map((i) => i.pr_pct),
						backgroundColor: "rgba(26,107,60,0.75)",
					},
				],
			},
			options: {
				indexAxis: "y",
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: "top", labels: { boxWidth: 10, font: { size: 10 } } },
				},
				scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } } },
			},
		});
	} else if (ctx1) {
		ctx1.parentElement.innerHTML = empty_note();
	}

	const k = procurement.kpis || {};
	const remaining_po = Math.max(flt(k.total_boq_value) - flt(k.total_po_value), 0);
	const remaining_pr = Math.max(flt(k.total_po_value) - flt(k.total_pr_value), 0);
	const ctx2 = document.getElementById("pd-chart-procurement-split");
	if (ctx2 && flt(k.total_boq_value) > 0) {
		destroy("split");
		pd_charts["split"] = new Chart(ctx2, {
			type: "doughnut",
			data: {
				labels: [__("Received"), __("Ordered, not received"), __("Not yet ordered")],
				datasets: [
					{
						data: [flt(k.total_pr_value), remaining_pr, remaining_po],
						backgroundColor: ["#1a6b3c", "#8a5c00", "#d4cfc8"],
						borderWidth: 2,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 9 } } },
				},
			},
		});
	} else if (ctx2) {
		ctx2.parentElement.innerHTML = empty_note();
	}
}

function render_cost_type_chart(cost_by_type) {
	const labels = Object.keys(cost_by_type || {});
	const ctx = document.getElementById("pd-chart-cost-type");
	if (!ctx) return;
	if (!labels.length) {
		ctx.parentElement.innerHTML = empty_note();
		return;
	}
	destroy("cost_type");
	pd_charts["cost_type"] = new Chart(ctx, {
		type: "bar",
		data: {
			labels,
			datasets: [
				{
					label: __("Contract Value"),
					data: labels.map((l) => cost_by_type[l].contract_value),
					backgroundColor: "rgba(54,162,235,0.75)",
				},
				{
					label: __("Estimated Cost"),
					data: labels.map((l) => cost_by_type[l].estimated_cost),
					backgroundColor: "rgba(255,159,64,0.75)",
				},
				{
					label: __("Actual Cost"),
					data: labels.map((l) => cost_by_type[l].actual_cost),
					backgroundColor: "rgba(255,99,132,0.75)",
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: { legend: { position: "top", labels: { boxWidth: 10, font: { size: 10 } } } },
		},
	});
}

function render_cost_head_chart(rows) {
	const ctx = document.getElementById("pd-chart-cost-head");
	if (!ctx) return;
	if (!rows || !rows.length) {
		ctx.parentElement.innerHTML = empty_note();
		return;
	}
	destroy("cost_head");
	pd_charts["cost_head"] = new Chart(ctx, {
		type: "bar",
		data: {
			labels: rows.map((r) => r.cost_head),
			datasets: [
				{
					label: __("Budget"),
					data: rows.map((r) => r.budget_amount),
					backgroundColor: "rgba(54,162,235,0.75)",
				},
				{
					label: __("Committed"),
					data: rows.map((r) => r.committed_amount),
					backgroundColor: "rgba(255,159,64,0.75)",
				},
				{
					label: __("Actual"),
					data: rows.map((r) => r.actual_amount),
					backgroundColor: "rgba(255,99,132,0.75)",
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: { legend: { position: "top", labels: { boxWidth: 10, font: { size: 10 } } } },
		},
	});
}

function render_payment_chart(kpis) {
	const ctx = document.getElementById("pd-chart-payment");
	if (!ctx) return;
	const vals = [flt(kpis.received), flt(kpis.invoiced), flt(kpis.pending)];
	if (!vals.some((v) => v > 0)) {
		ctx.parentElement.innerHTML = empty_note();
		return;
	}
	destroy("payment");
	pd_charts["payment"] = new Chart(ctx, {
		type: "doughnut",
		data: {
			labels: [__("Received"), __("Invoiced"), __("Pending")],
			datasets: [
				{ data: vals, backgroundColor: ["#1a6b3c", "#8a5c00", "#d4cfc8"], borderWidth: 2 },
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 9 } } },
			},
		},
	});
}

function render_phase_chart(phases) {
	const ctx = document.getElementById("pd-chart-phase");
	if (!ctx) return;
	if (!phases || !phases.length) {
		ctx.parentElement.innerHTML = empty_note();
		return;
	}
	destroy("phase");
	pd_charts["phase"] = new Chart(ctx, {
		type: "bar",
		data: {
			labels: phases.map((p) => p.phase),
			datasets: [
				{
					label: __("% Complete"),
					data: phases.map((p) => p.percent_complete),
					backgroundColor: "rgba(26,107,60,0.75)",
				},
			],
		},
		options: {
			indexAxis: "y",
			responsive: true,
			maintainAspectRatio: false,
			plugins: { legend: { display: false } },
			scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } } },
		},
	});
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function empty_note() {
	return `<div style="padding:30px 0;text-align:center;color:var(--text-muted);font-size:12px;">${__(
		"Nothing to show yet"
	)}</div>`;
}

function flt(v) {
	const n = parseFloat(v);
	return isNaN(n) ? 0 : n;
}

function flt2(v) {
	return flt(v).toFixed(1);
}

function currency_symbol(currency) {
	currency = currency || frappe.boot?.sysdefaults?.currency || "";
	return (
		(currency &&
			frappe.model.get_currency_symbol &&
			frappe.model.get_currency_symbol(currency)) ||
		currency ||
		""
	);
}

function fmt_val(v) {
	v = flt(v);
	const neg = v < 0;
	v = Math.abs(v);
	let f, u;
	if (v >= 1e7) {
		f = v / 1e7;
		u = "Cr";
	} else if (v >= 1e5) {
		f = v / 1e5;
		u = "L";
	} else if (v >= 1e3) {
		f = v / 1e3;
		u = "K";
	} else {
		return (neg ? "-" : "") + v.toFixed(2);
	}
	const r = (f >= 10 ? f.toFixed(1) : f.toFixed(2)) + u;
	return neg ? "-" + r : r;
}
