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
			"label": _("Project"),
			"fieldname": "project",
			"fieldtype": "Link",
			"options": "Project",
			"width": 180,
		},
		{
			"label": _("Budget"),
			"fieldname": "budget_name",
			"fieldtype": "Link",
			"options": "Project Budget",
			"width": 180,
		},
		{
			"label": _("Cost Head"),
			"fieldname": "cost_head",
			"fieldtype": "Link",
			"options": "Budget Cost Head",
			"width": 150,
		},
		{"label": _("Description"), "fieldname": "description", "fieldtype": "Data", "width": 200},
		{"label": _("Budget Amount"), "fieldname": "budget_amount", "fieldtype": "Currency", "width": 130},
		{"label": _("Committed"), "fieldname": "committed_amount", "fieldtype": "Currency", "width": 130},
		{"label": _("Actual"), "fieldname": "actual_amount", "fieldtype": "Currency", "width": 130},
		{"label": _("Remaining"), "fieldname": "remaining_balance", "fieldtype": "Currency", "width": 130},
		{"label": _("% Used"), "fieldname": "percent_used", "fieldtype": "Percent", "width": 90},
	]


def get_data(filters):
	pb = frappe.qb.DocType("Project Budget")
	pbi = frappe.qb.DocType("Project Budget Item")

	query = (
		frappe.qb.from_(pb)
		.inner_join(pbi)
		.on(pbi.parent == pb.name)
		.select(
			pb.project,
			pb.name.as_("budget_name"),
			pbi.cost_head,
			pbi.description,
			pbi.budget_amount,
			pbi.committed_amount,
			pbi.actual_amount,
			pbi.remaining_balance,
		)
		.orderby(pb.project)
		.orderby(pbi.cost_head)
	)

	if filters and filters.get("project"):
		query = query.where(pb.project == filters.get("project"))
	if filters and filters.get("cost_head"):
		query = query.where(pbi.cost_head == filters.get("cost_head"))

	data = query.run(as_dict=True)

	for row in data:
		budget = row.get("budget_amount") or 0
		committed = row.get("committed_amount") or 0
		actual = row.get("actual_amount") or 0
		row["percent_used"] = ((committed + actual) / budget * 100) if budget else 0

	return data
