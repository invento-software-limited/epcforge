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
