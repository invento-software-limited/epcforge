// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("Task", {
	refresh: function (frm) {
		if (frm.doc.project) {
			frm.add_custom_button(
				__("Project BOQs"),
				function () {
					frappe.set_route("List", "BOQ", {
						project: frm.doc.project,
					});
				},
				__("EPCForge")
			);

			frm.add_custom_button(
				__("Project Budget"),
				function () {
					frappe.db
						.get_value("Project Budget", { project: frm.doc.project }, "name")
						.then((r) => {
							if (r && r.name) {
								frappe.set_route("Form", "Project Budget", r.name);
							} else {
								frappe.msgprint(__("No Project Budget found for this project"));
							}
						});
				},
				__("EPCForge")
			);

			frappe.call({
				method: "epcforge.epcforge.doctype.boq.boq.get_linked_boq_item",
				args: { task_name: frm.doc.name },
				callback: function (r) {
					if (r.message) {
						frm.add_custom_button(
							__("Material Request"),
							function () {
								frappe.model.open_mapped_doc({
									method: "epcforge.epcforge.doctype.boq.boq.create_mr_from_task",
									frm: frm,
								});
							},
							__("Create")
						);
					}
				},
			});
		}
	},
});
