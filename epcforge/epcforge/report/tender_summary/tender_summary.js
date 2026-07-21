// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt

frappe.query_reports["Tender Summary"] = {
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
