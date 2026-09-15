// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("BOQ", {
	refresh(frm) {
		frm.clear_custom_buttons();

		if (!frm.is_new()) {
			render_boq_dashboard(frm);
		}

		if (frm.doc.docstatus === 0 && frm.doc.project) {
			frm.add_custom_button(
				__("Sync Project Milestones"),
				function () {
					auto_populate_payment_schedule(frm, true);
				},
				__("Actions")
			);
		}

		if (frm.doc.docstatus === 1) {
			frm.add_custom_button(
				__("Material Request"),
				function () {
					frappe.model.open_mapped_doc({
						method: "epcforge.epcforge.doctype.boq.boq.create_material_request",
						frm: frm,
					});
				},
				__("Create")
			);

			frm.add_custom_button(
				__("Sales Invoice"),
				function () {
					const selected = frm.get_selected("boq_payment_schedule");
					if (selected.length !== 1) {
						frappe.msgprint(__("Please select exactly one Payment Schedule row."));
						return;
					}
					frappe.call({
						method: "epcforge.epcforge.doctype.boq.boq.create_sales_invoice",
						args: { source_name: frm.doc.name, milestone_row_name: selected[0] },
						callback: function (r) {
							if (r.message) {
								frappe.model.sync(r.message);
								frappe.set_route("Form", "Sales Invoice", r.message.name);
							}
						},
					});
				},
				__("Create")
			);
		}

		set_linked_wbs_query(frm);
	},

	project(frm) {
		auto_populate_payment_schedule(frm, false);
	},
});

frappe.ui.form.on("BOQ Item", {
	boq_code(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (row.item_type !== "Material" || !row.boq_code) return;

		frappe.db.get_value(
			"Item",
			row.boq_code,
			["description", "item_name", "stock_uom"],
			(r) => {
				if (r) {
					frappe.model.set_value(cdt, cdn, "description", r.description || r.item_name);
					frappe.model.set_value(cdt, cdn, "uom", r.stock_uom);
				}
			}
		);
		frappe.db.get_value(
			"Item Price",
			{ item_code: row.boq_code, price_list: "Standard Buying" },
			"price_list_rate",
			(r) => {
				if (r && r.price_list_rate)
					frappe.model.set_value(cdt, cdn, "rate", r.price_list_rate);
			}
		);
	},

	qty(frm) {
		recalculate_boq(frm);
	},
	rate(frm) {
		recalculate_boq(frm);
	},
	estimated_cost(frm) {
		recalculate_boq(frm);
	},
});

frappe.ui.form.on("BOQ Payment Schedule", {
	linked_wbs(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.linked_wbs) return;
		frappe.db.get_value(
			"Task",
			row.linked_wbs,
			["subject", "epc_billing_weightage", "exp_end_date"],
			(r) => {
				if (r) {
					frappe.model.set_value(cdt, cdn, "milestone", r.subject);
					frappe.model.set_value(
						cdt,
						cdn,
						"percent_amount",
						r.epc_billing_weightage || 0
					);
					frappe.model.set_value(cdt, cdn, "target_date", r.exp_end_date);
					recalculate_boq(frm);
				}
			}
		);
	},
	percent_amount(frm) {
		recalculate_boq(frm);
	},
});

function auto_populate_payment_schedule(frm, force) {
	if (!frm.doc.project) return;
	if (!force && frm.doc.boq_payment_schedule && frm.doc.boq_payment_schedule.length > 0) return;

	frappe.call({
		method: "epcforge.epcforge.doctype.boq.boq.get_billing_milestones",
		args: { project: frm.doc.project },
		callback: function (r) {
			if (!r.message || !r.message.length) return;
			if (force) frm.clear_table("boq_payment_schedule");

			r.message.forEach((ms) => {
				const exists = (frm.doc.boq_payment_schedule || []).some(
					(row) => row.linked_wbs === ms.name
				);
				if (!exists) {
					const child = frm.add_child("boq_payment_schedule");
					child.linked_wbs = ms.name;
					child.milestone = ms.subject;
					child.percent_amount = ms.epc_billing_weightage || 0;
					child.target_date = ms.exp_end_date;
				}
			});
			frm.refresh_field("boq_payment_schedule");
			recalculate_boq(frm);
		},
	});
}

function recalculate_boq(frm) {
	let total_amount = 0.0;
	(frm.doc.boq_items || []).forEach((item) => {
		item.amount = flt(item.qty) * flt(item.rate);
		total_amount += item.amount;
	});
	frm.refresh_field("boq_items");
	frm.set_value("total_amount", total_amount);

	(frm.doc.boq_payment_schedule || []).forEach((row) => {
		const gross = (flt(row.percent_amount) / 100.0) * total_amount;
		row.amount = gross;
		row.advance_deduction = (gross * flt(frm.doc.advance_pct)) / 100.0;
		row.retention_amount = (gross * flt(frm.doc.retention_pct)) / 100.0;
		row.net_payable = gross - flt(row.advance_deduction) - flt(row.retention_amount);
	});
	frm.refresh_field("boq_payment_schedule");
}

function set_linked_wbs_query(frm) {
	frm.set_query("linked_wbs", "boq_items", function (doc) {
		return { filters: { project: doc.project } };
	});
	frm.set_query("linked_wbs", "boq_payment_schedule", function (doc) {
		return { filters: { project: doc.project, custom_is_billing_milestone: 1 } };
	});
}

// ── In-form Dashboard (Procurement / Costing / Payment) ─────────────────────

function render_boq_dashboard(frm) {
	const field = frm.get_field("dashboard");
	if (!field) return;

	frappe.call({
		method: "epcforge.epcforge.doctype.boq.boq.get_boq_dashboard_data",
		args: { boq_name: frm.doc.name },
		callback(r) {
			if (!r.message) return;
			const { costing, procurement, item_type_costs, payment, currency } = r.message;
			const symbol = currency_symbol(currency);

			field.html(
				build_boq_dashboard_html(procurement, costing, item_type_costs, payment, symbol)
			);

			load_chartjs(() => {
				bind_boq_pagination();
				bind_boq_tabs(procurement, costing, item_type_costs, payment, symbol);
				render_tab_chart(
					"procurement",
					procurement,
					costing,
					item_type_costs,
					payment,
					symbol
				);
			});
		},
		error() {
			field.html(
				`<div style="padding:20px;color:#c92a2a;"><i class="fa fa-exclamation-circle"></i> ${__(
					"Error loading dashboard"
				)}</div>`
			);
		},
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

function currency_symbol(currency) {
	currency = currency || frappe.boot?.sysdefaults?.currency;
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
	return (neg ? "-" : "") + (f >= 10 ? f.toFixed(1) : f.toFixed(2)) + u;
}

function progress_bar(pct, color) {
	const w = Math.min(pct, 100);
	return `<div style="height:6px;background:var(--border-color);border-radius:3px;overflow:hidden;min-width:80px;flex:1;">
		<div style="height:100%;border-radius:3px;background:${color};width:${w}%;transition:width .4s;"></div>
	</div>`;
}

function build_boq_dashboard_html(procurement, costing, item_type_costs, payment, symbol) {
	return `
		<div class="boq-dashboard">
			<div class="boq-dashboard-tabs" style="display:flex;gap:4px;border-bottom:1px solid var(--border-color);margin-bottom:16px;">
				<button class="btn btn-default btn-xs boq-tab-btn active" data-tab="procurement" style="border-bottom-left-radius:0;border-bottom-right-radius:0;margin-bottom:-1px;padding:8px 16px;border-bottom:2px solid var(--blue-500);font-weight:600;background:none;border-top:none;border-left:none;border-right:none;color:var(--text-color);">${__(
					"Procurement Status"
				)}</button>
				<button class="btn btn-default btn-xs boq-tab-btn" data-tab="costing" style="border-bottom-left-radius:0;border-bottom-right-radius:0;margin-bottom:-1px;padding:8px 16px;border-bottom:2px solid transparent;font-weight:600;background:none;border-top:none;border-left:none;border-right:none;color:var(--text-muted);">${__(
					"Cost & Margin Analysis"
				)}</button>
				<button class="btn btn-default btn-xs boq-tab-btn" data-tab="payment" style="border-bottom-left-radius:0;border-bottom-right-radius:0;margin-bottom:-1px;padding:8px 16px;border-bottom:2px solid transparent;font-weight:600;background:none;border-top:none;border-left:none;border-right:none;color:var(--text-muted);">${__(
					"Milestone Payments"
				)}</button>
			</div>
			<div class="boq-tab-panel" id="boq-pane-procurement">
				${build_procurement_tab_html(procurement, symbol)}
			</div>
			<div class="boq-tab-panel" id="boq-pane-costing" style="display:none;">
				${build_costing_tab_html(costing, item_type_costs, symbol)}
			</div>
			<div class="boq-tab-panel" id="boq-pane-payment" style="display:none;">
				${build_payment_tab_html(payment, symbol)}
			</div>
		</div>`;
}

function build_procurement_tab_html(procurement, symbol) {
	const { kpis, items } = procurement;
	const po_vs_boq_pct = kpis.total_boq_value
		? round1((kpis.total_po_value / kpis.total_boq_value) * 100)
		: 0;
	const pr_vs_boq_pct = kpis.total_boq_value
		? round1((kpis.total_pr_value / kpis.total_boq_value) * 100)
		: 0;

	const kpi_html = `
		<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
			${kpi_card(
				__("BOQ Total Value"),
				symbol + fmt_val(kpis.total_boq_value),
				`${kpis.total_items} ${__("of")} ${kpis.total_boq_items} ${__("items are stock")}`
			)}
			${kpi_card(
				__("Material Requested"),
				kpis.mr_coverage_pct + "%",
				__("of BOQ qty covered by MRs"),
				"var(--blue-600)"
			)}
			${kpi_card(
				__("Purchase Ordered"),
				symbol + fmt_val(kpis.total_po_value),
				`${kpis.po_coverage_pct}% ${__("of qty")} · ${po_vs_boq_pct}% ${__("of value")}`,
				"var(--yellow-700)"
			)}
			${kpi_card(
				__("Goods Received"),
				symbol + fmt_val(kpis.total_pr_value),
				`${kpis.pr_coverage_pct}% ${__("of qty")} · ${pr_vs_boq_pct}% ${__("of value")}`,
				"var(--green-600)"
			)}
		</div>`;

	const rows_per_page = 10;
	const total_pages = Math.ceil(items.length / rows_per_page) || 1;
	let table_rows = "";
	items.forEach((item, idx) => {
		const page = Math.floor(idx / rows_per_page) + 1;
		const hidden = page === 1 ? "" : "display:none;";
		table_rows += `
			<tr style="border-bottom:1px solid var(--border-color);${hidden}" data-page="${page}" class="boq-db-row">
				<td style="padding:7px 10px;font-weight:600;color:var(--text-color);font-size:11px;">${frappe.utils.escape_html(
					item.item_code
				)}</td>
				<td style="padding:7px 10px;font-size:11px;color:var(--text-muted);max-width:180px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">${frappe.utils.escape_html(
					item.description || ""
				)}</td>
				<td style="padding:7px 10px;font-size:11px;color:var(--text-muted);">${frappe.utils.escape_html(
					item.group || ""
				)}</td>
				<td style="padding:7px 10px;text-align:right;font-family:'IBM Plex Mono';font-size:11px;color:var(--text-color);">${
					item.boq_qty
				} ${item.uom}</td>
				<td style="padding:7px 10px;">
					<div style="display:flex;align-items:center;gap:6px;">${progress_bar(
						item.mr_pct,
						"var(--blue-500)"
					)}<span style="font-size:10px;font-family:'IBM Plex Mono';min-width:34px;text-align:right;color:var(--blue-600);">${
			item.mr_pct
		}%</span></div>
					<div style="font-size:9px;color:var(--text-muted);margin-top:2px;">${item.mr_qty} ${__(
			"requested"
		)}</div>
				</td>
				<td style="padding:7px 10px;">
					<div style="display:flex;align-items:center;gap:6px;">${progress_bar(
						item.po_pct,
						"var(--yellow-500)"
					)}<span style="font-size:10px;font-family:'IBM Plex Mono';min-width:34px;text-align:right;color:var(--yellow-700);">${
			item.po_pct
		}%</span></div>
					<div style="font-size:9px;color:var(--text-muted);margin-top:2px;">${item.po_qty} ${__(
			"ordered"
		)}</div>
				</td>
				<td style="padding:7px 10px;">
					<div style="display:flex;align-items:center;gap:6px;">${progress_bar(
						item.pr_pct,
						"var(--green-500)"
					)}<span style="font-size:10px;font-family:'IBM Plex Mono';min-width:34px;text-align:right;color:var(--green-600);">${
			item.pr_pct
		}%</span></div>
					<div style="font-size:9px;color:var(--text-muted);margin-top:2px;">${item.pr_qty} ${__(
			"received"
		)}</div>
				</td>
			</tr>`;
	});
	if (!items.length) {
		table_rows = `<tr><td colspan="7" style="padding:14px;text-align:center;color:var(--text-muted);">${__(
			"No stock items in this BOQ."
		)}</td></tr>`;
	}

	let pagination_html = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;" id="boq-db-pagination">`;
	if (total_pages > 1) {
		pagination_html += `<button id="boq-db-prev" style="padding:5px 11px;border:1px solid var(--border-color);background:var(--card-bg);border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;color:var(--blue-600);" disabled>&laquo;</button>`;
		for (let i = 1; i <= total_pages; i++) {
			const active = i === 1;
			pagination_html += `<button class="boq-db-pg" data-page="${i}" style="padding:5px 11px;border:1px solid ${
				active ? "var(--blue-500)" : "var(--border-color)"
			};background:${active ? "var(--blue-500)" : "var(--card-bg)"};color:${
				active ? "#fff" : "var(--blue-600)"
			};border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;">${i}</button>`;
		}
		pagination_html += `<button id="boq-db-next" style="padding:5px 11px;border:1px solid var(--border-color);background:var(--card-bg);border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;color:var(--blue-600);">${__(
			"Next"
		)} &raquo;</button>`;
	}
	if (items.length > rows_per_page) {
		pagination_html += `<div style="margin-left:auto;"><button id="boq-db-show-all" style="padding:5px 13px;border:1px solid var(--yellow-500);background:var(--card-bg);border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;color:var(--yellow-700);">${__(
			"Show All"
		)}</button></div>`;
	}
	pagination_html += `</div>`;

	window.boq_db_state = {
		total_pages,
		rows_per_page,
		total_items: items.length,
		current_page: 1,
		show_all: false,
	};

	const table_html = `
		<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:18px;margin-bottom:16px;">
			<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-color);">
				<div style="font-size:13px;font-weight:700;color:var(--text-color);"><i class="fa fa-boxes-stacked" style="color:var(--blue-600);margin-right:8px;"></i>${__(
					"Stock Items — Procurement Status"
				)}</div>
				<div style="font-size:11px;color:var(--text-muted);">${__(
					"Showing"
				)} <span id="boq-db-showing">1–${Math.min(
		rows_per_page,
		items.length
	)}</span> ${__("of")} ${items.length} ${__("items")}</div>
			</div>
			<div style="overflow-x:auto;">
				<table style="width:100%;border-collapse:collapse;font-size:12px;">
					<thead><tr style="background:var(--subtle-fg);">
						${th(__("Item Code"))}${th(__("Description"))}${th(__("Group"))}${th(__("BOQ Qty"), "right")}
						${th(__("MR"), "left", "var(--blue-600)")}${th(__("PO"), "left", "var(--yellow-700)")}${th(
		__("PR"),
		"left",
		"var(--green-600)"
	)}
					</tr></thead>
					<tbody id="boq-db-tbody">${table_rows}</tbody>
				</table>
			</div>
			<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border-color);">${pagination_html}</div>
		</div>`;

	const charts_html = `
		<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:15px;">
			<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:18px;">
				<div style="font-size:13px;font-weight:700;color:var(--text-color);margin-bottom:14px;"><i class="fa fa-chart-bar" style="color:var(--blue-600);margin-right:8px;"></i>${__(
					"Procurement Progress by Item"
				)}</div>
				<canvas id="boq-progress-chart" style="max-height:300px;"></canvas>
			</div>
			<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:18px;">
				<div style="font-size:13px;font-weight:700;color:var(--text-color);margin-bottom:14px;"><i class="fa fa-chart-pie" style="color:var(--blue-600);margin-right:8px;"></i>${__(
					"Coverage Overview"
				)}</div>
				<canvas id="boq-coverage-chart" style="max-height:300px;"></canvas>
			</div>
		</div>`;

	return kpi_html + table_html + charts_html;
}

function build_costing_tab_html(costing, item_type_costs, symbol) {
	const margin_color =
		costing.gross_margin_pct >= 20
			? "var(--green-600)"
			: costing.gross_margin_pct >= 10
			? "var(--yellow-700)"
			: "var(--red-600)";
	const variance_color = costing.budget_variance >= 0 ? "var(--green-600)" : "var(--red-600)";

	const kpi_html = `
		<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px;">
			${kpi_card(
				__("Contract Value"),
				symbol + fmt_val(costing.contract_value),
				__("Total Selling Amount")
			)}
			${kpi_card(
				__("Estimated Cost"),
				symbol + fmt_val(costing.estimated_cost),
				__("Planned budget cost")
			)}
			${kpi_card(
				__("Gross Margin %"),
				costing.gross_margin_pct.toFixed(1) + "%",
				__("(Value - Cost) / Value"),
				margin_color
			)}
			${kpi_card(__("Actual Cost"), symbol + fmt_val(costing.actual_cost), __("Actual spent to date"))}
			${kpi_card(
				__("Budget Variance"),
				symbol + fmt_val(costing.budget_variance),
				__("Estimated - Actual"),
				variance_color
			)}
		</div>`;

	let table_rows = "";
	Object.keys(item_type_costs).forEach((itype) => {
		const c = item_type_costs[itype];
		const variance = flt(c.estimated_cost) - flt(c.actual_cost);
		const v_color = variance >= 0 ? "var(--green-600)" : "var(--red-600)";
		table_rows += `
			<tr style="border-bottom:1px solid var(--border-color);">
				<td style="padding:10px;font-weight:600;color:var(--text-color);font-size:12px;">${itype}</td>
				<td style="padding:10px;text-align:right;font-family:'IBM Plex Mono';font-size:12px;color:var(--text-color);">${symbol}${fmt_val(
			c.estimated_cost
		)}</td>
				<td style="padding:10px;text-align:right;font-family:'IBM Plex Mono';font-size:12px;color:var(--text-color);">${symbol}${fmt_val(
			c.actual_cost
		)}</td>
				<td style="padding:10px;text-align:right;font-family:'IBM Plex Mono';font-size:12px;color:${v_color};font-weight:600;">${symbol}${fmt_val(
			variance
		)}</td>
			</tr>`;
	});
	if (!Object.keys(item_type_costs).length) {
		table_rows = `<tr><td colspan="4" style="padding:14px;text-align:center;color:var(--text-muted);">${__(
			"No BOQ items yet."
		)}</td></tr>`;
	}

	const table_html = `
		<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:18px;margin-bottom:16px;">
			<div style="font-size:13px;font-weight:700;color:var(--text-color);margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-color);"><i class="fa fa-calculator" style="color:var(--blue-600);margin-right:8px;"></i>${__(
				"Cost Breakdown by Item Type"
			)}</div>
			<div style="overflow-x:auto;">
				<table style="width:100%;border-collapse:collapse;font-size:12px;">
					<thead><tr style="background:var(--subtle-fg);">
						${th(__("Item Type"))}${th(__("Estimated Cost"), "right")}${th(__("Actual Cost"), "right")}${th(
		__("Variance"),
		"right"
	)}
					</tr></thead>
					<tbody>${table_rows}</tbody>
				</table>
			</div>
		</div>`;

	const chart_html = `
		<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:18px;margin-bottom:15px;">
			<div style="font-size:13px;font-weight:700;color:var(--text-color);margin-bottom:14px;"><i class="fa fa-chart-column" style="color:var(--blue-600);margin-right:8px;"></i>${__(
				"Estimated vs Actual Cost Comparison"
			)}</div>
			<canvas id="boq-costing-chart" style="max-height:300px;"></canvas>
		</div>`;

	return kpi_html + table_html + chart_html;
}

function build_payment_tab_html(payment, symbol) {
	const { kpis, rows } = payment;
	const kpi_html = `
		<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
			${kpi_card(
				__("Milestones Received"),
				symbol + fmt_val(kpis.received),
				__("Payments cleared by client"),
				"var(--green-600)"
			)}
			${kpi_card(
				__("Invoiced (Unpaid)"),
				symbol + fmt_val(kpis.invoiced),
				__("Sales Invoices generated"),
				"var(--yellow-700)"
			)}
			${kpi_card(__("Pending Invoicing"), symbol + fmt_val(kpis.pending), __("Future milestones"))}
		</div>`;

	let table_rows = "";
	if (!rows || !rows.length) {
		table_rows = `<tr><td colspan="8" style="padding:14px;text-align:center;color:var(--text-muted);">${__(
			"No payment milestones defined."
		)}</td></tr>`;
	} else {
		const status_colors = {
			Pending: "background-color:var(--gray-100);color:var(--gray-700);",
			Invoiced: "background-color:var(--yellow-100);color:var(--yellow-800);",
			Received: "background-color:var(--green-100);color:var(--green-800);",
		};
		rows.forEach((m) => {
			const status_style = status_colors[m.payment_status] || status_colors.Pending;
			const invoice_link = m.sales_invoice
				? `<a href="/app/sales-invoice/${m.sales_invoice}" style="color:var(--blue-600);font-weight:600;"><i class="fa fa-file-invoice" style="margin-right:4px;"></i>${m.sales_invoice}</a>`
				: `<span style="color:var(--text-muted);">—</span>`;
			const wbs_link = m.linked_wbs
				? `<a href="/app/task/${m.linked_wbs}" style="color:var(--text-muted);"><i class="fa fa-tasks" style="margin-right:4px;"></i>${m.linked_wbs}</a>`
				: "—";
			table_rows += `
				<tr style="border-bottom:1px solid var(--border-color);">
					<td style="padding:10px;font-weight:600;color:var(--text-color);font-size:12px;">${frappe.utils.escape_html(
						m.milestone || ""
					)}</td>
					<td style="padding:10px;font-size:11px;">${wbs_link}</td>
					<td style="padding:10px;font-size:11px;color:var(--text-muted);">${m.target_date || "—"}</td>
					<td style="padding:10px;text-align:right;font-family:'IBM Plex Mono';font-size:12px;">${
						m.percent_amount
					}%</td>
					<td style="padding:10px;text-align:right;font-family:'IBM Plex Mono';font-size:12px;color:var(--text-color);font-weight:600;">${symbol}${fmt_val(
				m.amount
			)}</td>
					<td style="padding:10px;text-align:right;font-family:'IBM Plex Mono';font-size:12px;color:var(--text-color);">${symbol}${fmt_val(
				m.net_payable
			)}</td>
					<td style="padding:10px;">${invoice_link}</td>
					<td style="padding:10px;text-align:center;"><span style="display:inline-block;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:600;text-transform:uppercase;${status_style}">${
				m.payment_status
			}</span></td>
				</tr>`;
		});
	}

	const table_html = `
		<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:18px;margin-bottom:16px;">
			<div style="font-size:13px;font-weight:700;color:var(--text-color);margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-color);"><i class="fa fa-credit-card" style="color:var(--blue-600);margin-right:8px;"></i>${__(
				"Milestone Payment Schedule"
			)}</div>
			<div style="overflow-x:auto;">
				<table style="width:100%;border-collapse:collapse;font-size:12px;">
					<thead><tr style="background:var(--subtle-fg);">
						${th(__("Milestone"))}${th(__("Linked WBS"))}${th(__("Target Date"))}${th("%", "right")}${th(
		__("Gross Amount"),
		"right"
	)}${th(__("Net Payable"), "right")}${th(__("Sales Invoice"))}${th(__("Status"), "center")}
					</tr></thead>
					<tbody>${table_rows}</tbody>
				</table>
			</div>
		</div>`;

	const chart_html = `
		<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:18px;margin-bottom:15px;">
			<div style="font-size:13px;font-weight:700;color:var(--text-color);margin-bottom:14px;"><i class="fa fa-chart-pie" style="color:var(--blue-600);margin-right:8px;"></i>${__(
				"Payment Status Allocation"
			)}</div>
			<canvas id="boq-payment-chart" style="max-height:300px;"></canvas>
		</div>`;

	return kpi_html + table_html + chart_html;
}

function kpi_card(label, value, caption, color) {
	return `
		<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:14px;">
			<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">${label}</div>
			<div style="font-size:18px;font-weight:700;font-family:'IBM Plex Mono';color:${
				color || "var(--text-color)"
			};">${value}</div>
			<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${caption}</div>
		</div>`;
}

function th(label, align, color) {
	return `<th style="padding:7px 10px;text-align:${
		align || "left"
	};font-size:10px;font-weight:600;text-transform:uppercase;color:${
		color || "var(--text-muted)"
	};border-bottom:2px solid var(--border-color);">${label}</th>`;
}

function round1(v) {
	return Math.round(v * 10) / 10;
}

function bind_boq_tabs(procurement, costing, item_type_costs, payment, symbol) {
	document.querySelectorAll(".boq-tab-btn").forEach((btn) => {
		btn.addEventListener("click", function () {
			document.querySelectorAll(".boq-tab-btn").forEach((b) => {
				b.classList.remove("active");
				b.style.borderBottomColor = "transparent";
				b.style.color = "var(--text-muted)";
			});
			document.querySelectorAll(".boq-tab-panel").forEach((p) => {
				p.style.display = "none";
			});
			this.classList.add("active");
			this.style.borderBottomColor = "var(--blue-500)";
			this.style.color = "var(--text-color)";
			const tab = this.dataset.tab;
			const panel = document.getElementById(`boq-pane-${tab}`);
			if (panel) panel.style.display = "block";
			render_tab_chart(tab, procurement, costing, item_type_costs, payment, symbol);
		});
	});
}

function bind_boq_pagination() {
	const st = window.boq_db_state || {};
	if (!st.total_pages) return;

	function update_rows(page, all) {
		document.querySelectorAll(".boq-db-row").forEach((r) => {
			r.style.display = all || parseInt(r.dataset.page) === page ? "" : "none";
		});
		const start = all ? 1 : (page - 1) * st.rows_per_page + 1;
		const end = all ? st.total_items : Math.min(page * st.rows_per_page, st.total_items);
		const el = document.getElementById("boq-db-showing");
		if (el) el.textContent = `${start}–${end}`;
	}

	function update_btns(page) {
		document.querySelectorAll(".boq-db-pg").forEach((b) => {
			const p = parseInt(b.dataset.page);
			b.style.background = p === page ? "var(--blue-500)" : "var(--card-bg)";
			b.style.color = p === page ? "#fff" : "var(--blue-600)";
			b.style.borderColor = p === page ? "var(--blue-500)" : "var(--border-color)";
		});
		const prev = document.getElementById("boq-db-prev");
		const next = document.getElementById("boq-db-next");
		if (prev) prev.disabled = page === 1;
		if (next) next.disabled = page === st.total_pages;
	}

	document.querySelectorAll(".boq-db-pg").forEach((b) => {
		b.addEventListener("click", function () {
			st.current_page = parseInt(this.dataset.page);
			st.show_all = false;
			update_rows(st.current_page, false);
			update_btns(st.current_page);
			const sa = document.getElementById("boq-db-show-all");
			if (sa) sa.textContent = __("Show All");
		});
	});

	const prev = document.getElementById("boq-db-prev");
	const next = document.getElementById("boq-db-next");
	const sa = document.getElementById("boq-db-show-all");

	if (prev)
		prev.addEventListener("click", () => {
			if (st.current_page > 1) {
				st.current_page--;
				update_rows(st.current_page, false);
				update_btns(st.current_page);
				st.show_all = false;
				if (sa) sa.textContent = __("Show All");
			}
		});
	if (next)
		next.addEventListener("click", () => {
			if (st.current_page < st.total_pages) {
				st.current_page++;
				update_rows(st.current_page, false);
				update_btns(st.current_page);
				st.show_all = false;
				if (sa) sa.textContent = __("Show All");
			}
		});
	if (sa)
		sa.addEventListener("click", function () {
			st.show_all = !st.show_all;
			update_rows(1, st.show_all);
			this.textContent = st.show_all ? __("Show Less") : __("Show All");
			if (!st.show_all) update_btns(st.current_page);
		});

	update_btns(1);
}

let boq_charts = {};

function chart_divisor(vals) {
	const maxVal = Math.max(...vals.filter((v) => v > 0), 0);
	if (maxVal >= 1e7) return { divisor: 1e7, label_ext: "Cr" };
	if (maxVal >= 1e5) return { divisor: 1e5, label_ext: "L" };
	if (maxVal >= 1e3) return { divisor: 1e3, label_ext: "K" };
	return { divisor: 1, label_ext: "" };
}

function render_tab_chart(tab, procurement, costing, item_type_costs, payment, symbol) {
	if (boq_charts[tab]) {
		(Array.isArray(boq_charts[tab]) ? boq_charts[tab] : [boq_charts[tab]]).forEach(
			(c) => c && c.destroy()
		);
		delete boq_charts[tab];
	}

	if (tab === "procurement") {
		const ctx1 = document.getElementById("boq-progress-chart");
		const ctx2 = document.getElementById("boq-coverage-chart");
		if (!ctx1 || !ctx2) return;
		const { kpis, items } = procurement;
		const top = items.slice(0, 10);

		const c1 = new Chart(ctx1, {
			type: "bar",
			data: {
				labels: top.map((i) => (i.item_code || "").substring(0, 18)),
				datasets: [
					{
						label: "MR %",
						data: top.map((i) => i.mr_pct),
						backgroundColor: "rgba(15,61,107,0.7)",
						borderRadius: 3,
					},
					{
						label: "PO %",
						data: top.map((i) => i.po_pct),
						backgroundColor: "rgba(138,92,0,0.7)",
						borderRadius: 3,
					},
					{
						label: "GR %",
						data: top.map((i) => i.pr_pct),
						backgroundColor: "rgba(26,107,60,0.7)",
						borderRadius: 3,
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
				scales: {
					x: {
						min: 0,
						max: 100,
						ticks: { callback: (v) => v + "%", font: { size: 9 } },
					},
					y: { ticks: { font: { size: 9 } } },
				},
			},
		});

		const { divisor, label_ext } = chart_divisor([
			kpis.total_boq_value,
			kpis.total_po_value,
			kpis.total_pr_value,
		]);
		const remaining_po = Math.max(kpis.total_boq_value - kpis.total_po_value, 0);
		const remaining_pr = Math.max(kpis.total_po_value - kpis.total_pr_value, 0);
		const c2 = new Chart(ctx2, {
			type: "doughnut",
			data: {
				labels: [
					__("Goods Received"),
					__("Ordered (not received)"),
					__("Not Yet Ordered"),
				],
				datasets: [
					{
						data: [
							parseFloat((kpis.total_pr_value / divisor).toFixed(2)),
							parseFloat((remaining_pr / divisor).toFixed(2)),
							parseFloat((remaining_po / divisor).toFixed(2)),
						],
						backgroundColor: ["#1a6b3c", "#8a5c00", "#d4cfc8"],
						borderWidth: 2,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: "right", labels: { boxWidth: 10, font: { size: 9 } } },
					tooltip: {
						callbacks: {
							label: (ctx) =>
								`${ctx.label}: ${symbol}${ctx.parsed.toFixed(
									2
								)} ${label_ext}`.trim(),
						},
					},
				},
				cutout: "60%",
			},
		});
		boq_charts["procurement"] = [c1, c2];
	} else if (tab === "costing") {
		const ctx = document.getElementById("boq-costing-chart");
		if (!ctx) return;
		const labels = Object.keys(item_type_costs);
		const budget_data = labels.map((l) => flt(item_type_costs[l].estimated_cost));
		const actual_data = labels.map((l) => flt(item_type_costs[l].actual_cost));
		const { divisor, label_ext } = chart_divisor([...budget_data, ...actual_data]);

		boq_charts["costing"] = new Chart(ctx, {
			type: "bar",
			data: {
				labels,
				datasets: [
					{
						label: __("Estimated Cost"),
						data: budget_data.map((v) => parseFloat((v / divisor).toFixed(2))),
						backgroundColor: "rgba(54, 162, 235, 0.7)",
						borderRadius: 3,
					},
					{
						label: __("Actual Cost"),
						data: actual_data.map((v) => parseFloat((v / divisor).toFixed(2))),
						backgroundColor: "rgba(255, 99, 132, 0.7)",
						borderRadius: 3,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: "top", labels: { boxWidth: 10 } },
					tooltip: {
						callbacks: {
							label: (ctx) =>
								`${ctx.dataset.label}: ${symbol}${ctx.parsed.toFixed(
									2
								)} ${label_ext}`.trim(),
						},
					},
				},
				scales: {
					y: {
						ticks: { callback: (v) => v + label_ext },
						grid: { color: "rgba(0,0,0,.04)" },
					},
				},
			},
		});
	} else if (tab === "payment") {
		const ctx = document.getElementById("boq-payment-chart");
		if (!ctx) return;
		const { kpis } = payment;
		const vals = [kpis.received, kpis.invoiced, kpis.pending];
		const { divisor, label_ext } = chart_divisor(vals);

		boq_charts["payment"] = new Chart(ctx, {
			type: "doughnut",
			data: {
				labels: [
					__("Milestones Received"),
					__("Invoiced (Unpaid)"),
					__("Pending Invoicing"),
				],
				datasets: [
					{
						data: vals.map((v) => parseFloat((v / divisor).toFixed(2))),
						backgroundColor: ["#1a6b3c", "#8a5c00", "#d4cfc8"],
						borderWidth: 2,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: "right", labels: { boxWidth: 10, font: { size: 9 } } },
					tooltip: {
						callbacks: {
							label: (ctx) =>
								`${ctx.label}: ${symbol}${ctx.parsed.toFixed(
									2
								)} ${label_ext}`.trim(),
						},
					},
				},
				cutout: "60%",
			},
		});
	}
}
