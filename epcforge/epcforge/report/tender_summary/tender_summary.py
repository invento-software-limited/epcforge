# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{
			"fieldname": "tender_name",
			"label": _("Tender"),
			"fieldtype": "Link",
			"options": "Tender",
			"width": 200,
		},
		{
			"fieldname": "project",
			"label": _("Project"),
			"fieldtype": "Link",
			"options": "Project",
			"width": 150,
		},
		{
			"fieldname": "tender_type",
			"label": _("Type"),
			"fieldtype": "Data",
			"width": 100,
		},
		{
			"fieldname": "status",
			"label": _("Status"),
			"fieldtype": "Data",
			"width": 120,
		},
		{
			"fieldname": "scope_of_work",
			"label": _("Scope of Work"),
			"fieldtype": "Small Text",
			"width": 200,
		},
		{
			"fieldname": "number_of_bidders",
			"label": _("No. of Bidders"),
			"fieldtype": "Int",
			"width": 120,
		},
		{
			"fieldname": "submission_deadline",
			"label": _("Submission Deadline"),
			"fieldtype": "Datetime",
			"width": 150,
		},
		{
			"fieldname": "evaluation_notes",
			"label": _("Evaluation Summary"),
			"fieldtype": "Small Text",
			"width": 200,
		},
		{
			"fieldname": "awarded_to",
			"label": _("Awarded To"),
			"fieldtype": "Link",
			"options": "Supplier",
			"width": 150,
		},
		{
			"fieldname": "award_amount",
			"label": _("Award Amount"),
			"fieldtype": "Currency",
			"width": 120,
		},
	]


def get_data(filters):
	conditions = []

	if filters:
		if filters.get("project"):
			conditions.append(f"t.project = {frappe.db.escape(filters.get('project'))}")
		if filters.get("tender_type"):
			conditions.append(f"t.tender_type = {frappe.db.escape(filters.get('tender_type'))}")
		if filters.get("status"):
			conditions.append(f"t.status = {frappe.db.escape(filters.get('status'))}")
		if filters.get("from_date"):
			conditions.append(f"t.submission_deadline >= {frappe.db.escape(filters.get('from_date'))}")
		if filters.get("to_date"):
			conditions.append(f"t.submission_deadline <= {frappe.db.escape(filters.get('to_date'))}")

	where_clause = " AND ".join(conditions) if conditions else "1=1"

	query = f"""
        SELECT
            t.name AS tender_name,
            t.project,
            t.tender_type,
            t.status,
            t.scope_of_work,
            (SELECT COUNT(*) FROM `tabTender Bidder` tb WHERE tb.parent = t.name) AS number_of_bidders,
            t.submission_deadline,
            t.evaluation_notes,
            t.awarded_to,
            t.award_amount
        FROM
            `tabTender` t
        WHERE
            {where_clause}
        ORDER BY
            t.submission_deadline DESC
    """

	return frappe.db.sql(query, as_dict=True)
