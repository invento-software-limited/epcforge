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
	t = frappe.qb.DocType("Tender")
	tb = frappe.qb.DocType("Tender Bidder")

	subquery = frappe.qb.from_(tb).select(frappe.qb.fn.Count("*")).where(tb.parent == t.name)

	query = (
		frappe.qb.from_(t)
		.select(
			t.name.as_("tender_name"),
			t.project,
			t.tender_type,
			t.status,
			t.scope_of_work,
			subquery.as_("number_of_bidders"),
			t.submission_deadline,
			t.evaluation_notes,
			t.awarded_to,
			t.award_amount,
		)
		.orderby(t.submission_deadline, order=frappe.qb.desc)
	)

	if filters:
		if filters.get("project"):
			query = query.where(t.project == filters.get("project"))
		if filters.get("tender_type"):
			query = query.where(t.tender_type == filters.get("tender_type"))
		if filters.get("status"):
			query = query.where(t.status == filters.get("status"))
		if filters.get("from_date"):
			query = query.where(t.submission_deadline >= filters.get("from_date"))
		if filters.get("to_date"):
			query = query.where(t.submission_deadline <= filters.get("to_date"))

	return query.run(as_dict=True)
