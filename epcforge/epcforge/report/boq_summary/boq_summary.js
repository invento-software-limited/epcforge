// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt

frappe.query_reports["BOQ Summary"] = {
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
