// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("Project", {
	refresh: function (frm) {
		if (frm.is_new()) return;

		// --- BOQ Section ---
		frm.add_custom_button(
			__("BOQ"),
			function () {
				frappe.set_route("List", "BOQ", { project: frm.doc.name });
			},
			__("EPCForge")
		);

		frm.add_custom_button(
			__("New BOQ"),
			function () {
				frappe.new_doc("BOQ", { project: frm.doc.name });
			},
			__("EPCForge")
		);

		// --- Tender Section ---
		frm.add_custom_button(
			__("Tenders"),
			function () {
				frappe.set_route("List", "Tender", {
					project: frm.doc.name,
				});
			},
			__("EPCForge")
		);

		frm.add_custom_button(
			__("Tender Summary"),
			function () {
				frappe.set_route("query-report", "Tender Summary", {
					project: frm.doc.name,
				});
			},
			__("EPCForge")
		);

		frm.add_custom_button(
			__("New Tender"),
			function () {
				frappe.new_doc("Tender", {
					project: frm.doc.name,
					status: "Draft",
				});
			},
			__("EPCForge")
		);

		// --- Document Register Section ---
		frm.add_custom_button(
			__("Documents"),
			function () {
				frappe.set_route("List", "Document Register", {
					project: frm.doc.name,
				});
			},
			__("EPCForge")
		);

		frm.add_custom_button(
			__("New Document"),
			function () {
				frappe.new_doc("Document Register", {
					project: frm.doc.name,
				});
			},
			__("EPCForge")
		);

		// --- Budget (dynamic: open existing or create new) ---
		frappe.db.get_value("Project Budget", { project: frm.doc.name }, "name").then((r) => {
			if (r && r.name) {
				frm.add_custom_button(
					__("Open Budget"),
					function () {
						frappe.set_route("Form", "Project Budget", r.name);
					},
					__("EPCForge")
				);
			} else {
				frm.add_custom_button(
					__("Create Budget"),
					function () {
						frappe.new_doc("Project Budget", {
							project: frm.doc.name,
							project_name: frm.doc.project_name,
						});
					},
					__("EPCForge")
				);
			}
		});
	},
});
