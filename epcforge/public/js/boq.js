// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("BOQ", {
	refresh(frm) {
		frm.clear_custom_buttons();

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
					show_sales_invoice_dialog(frm);
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

function show_sales_invoice_dialog(frm) {
	if (frm.is_dirty()) {
		frappe.msgprint(__("Please save the BOQ before creating a Sales Invoice."));
		return;
	}

	const schedules = frm.doc.boq_payment_schedule || [];
	if (!schedules.length) {
		frappe.msgprint({
			title: __("No Payment Schedule"),
			indicator: "orange",
			message: __("This BOQ does not have any Payment Schedule milestones to invoice."),
		});
		return;
	}

	const unbilled = schedules.filter((row) => !row.sales_invoice);
	if (!unbilled.length) {
		frappe.msgprint({
			title: __("All Milestones Invoiced"),
			indicator: "orange",
			message: __("All Payment Schedule milestones for this BOQ have already been invoiced."),
		});
		return;
	}

	const selected_rows = frm.get_selected("boq_payment_schedule") || [];
	let preselected = null;
	if (selected_rows.length === 1 && unbilled.some((r) => r.name === selected_rows[0])) {
		preselected = selected_rows[0];
	} else {
		preselected = unbilled[0].name;
	}

	const options = unbilled.map((r) => {
		const amt = format_currency(r.amount, frm.doc.currency);
		const pct = r.percent_amount ? `${r.percent_amount}%` : "0%";
		let label = `${r.idx ? r.idx + ". " : ""}${r.milestone} (${pct} — ${amt})`;
		if (r.payment_status && r.payment_status !== "Pending") {
			label += ` [${r.payment_status}]`;
		}
		return {
			label: label,
			value: r.name,
		};
	});

	function render_preview(milestone_name) {
		const r = unbilled.find((x) => x.name === milestone_name) || unbilled[0];
		if (!r) return "";

		const amt = format_currency(r.amount, frm.doc.currency);
		const adv = r.advance_deduction ? format_currency(r.advance_deduction, frm.doc.currency) : "—";
		const ret = r.retention_amount ? format_currency(r.retention_amount, frm.doc.currency) : "—";
		const net = r.net_payable ? format_currency(r.net_payable, frm.doc.currency) : amt;
		const target_date = r.target_date ? frappe.datetime.str_to_user(r.target_date) : "—";
		const pct = r.percent_amount ? `${r.percent_amount}%` : "0%";

		return `
			<div class="boq-milestone-preview-card" style="background: var(--bg-light-gray, #f8f9fa); border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; padding: 14px 16px; margin-top: 10px;">
				<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
					<span style="font-weight: 600; font-size: 14px; color: var(--text-color, #1f272e);">${frappe.utils.escape_html(r.milestone || "")}</span>
					<span class="badge badge-primary" style="font-size: 12px; padding: 4px 8px;">${pct}</span>
				</div>
				<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 12px;">
					<div><span class="text-muted">${__("Gross Amount")}:</span> <b style="color: var(--text-color, #1f272e);">${amt}</b></div>
					<div><span class="text-muted">${__("Target Date")}:</span> <b>${target_date}</b></div>
					<div><span class="text-muted">${__("Advance Deduction")}:</span> <b>${adv}</b></div>
					<div><span class="text-muted">${__("Retention Amount")}:</span> <b>${ret}</b></div>
					<div style="grid-column: span 2; border-top: 1px solid var(--border-color, #e2e8f0); padding-top: 8px; margin-top: 4px; display: flex; justify-content: space-between;">
						<span class="text-muted" style="font-size: 13px;">${__("Estimated Net Payable")}:</span>
						<b style="font-size: 14px; color: var(--primary, #1b84ff);">${net}</b>
					</div>
				</div>
			</div>
		`;
	}

	const dialog = new frappe.ui.Dialog({
		title: __("Create Sales Invoice"),
		fields: [
			{
				fieldname: "milestone_row_name",
				fieldtype: "Select",
				label: __("Payment Milestone"),
				options: options,
				default: preselected,
				reqd: 1,
				description: __("Select the payment schedule milestone you want to bill."),
				onchange() {
					const val = dialog.get_value("milestone_row_name");
					if (dialog.fields_dict.preview_html) {
						dialog.fields_dict.preview_html.$wrapper.html(render_preview(val));
					}
				},
			},
			{
				fieldname: "preview_html",
				fieldtype: "HTML",
			},
		],
		primary_action_label: __("Create Sales Invoice"),
		primary_action(values) {
			if (!values.milestone_row_name) {
				frappe.msgprint(__("Please select a Payment Schedule milestone."));
				return;
			}
			dialog.hide();
			frappe.call({
				method: "epcforge.epcforge.doctype.boq.boq.create_sales_invoice",
				args: {
					source_name: frm.doc.name,
					milestone_row_name: values.milestone_row_name,
				},
				freeze: true,
				freeze_message: __("Creating Sales Invoice..."),
				callback: function (r) {
					if (r.message) {
						frappe.model.sync(r.message);
						frappe.set_route("Form", "Sales Invoice", r.message.name);
					}
				},
			});
		},
	});

	dialog.show();
	setTimeout(() => {
		if (dialog.fields_dict.preview_html) {
			dialog.fields_dict.preview_html.$wrapper.html(render_preview(preselected));
		}
	}, 100);
}
