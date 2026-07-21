// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt

frappe.query_reports["Budget vs Actual"] = {
	filters: [
		{
			fieldname: "project",
			label: __("Project"),
			fieldtype: "Link",
			options: "Project",
		},
		{
			fieldname: "cost_head",
			label: __("Cost Head"),
			fieldtype: "Link",
			options: "Budget Cost Head",
		},
	],
};
