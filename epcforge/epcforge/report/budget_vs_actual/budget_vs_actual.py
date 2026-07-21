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
	conditions = []
	if filters and filters.get("project"):
		conditions.append(f"pb.project = {frappe.db.escape(filters.project)}")
	if filters and filters.get("cost_head"):
		conditions.append(f"pbi.cost_head = {frappe.db.escape(filters.cost_head)}")

	where_clause = " AND ".join(conditions) if conditions else "1=1"

	data = frappe.db.sql(
		f"""
        SELECT
            pb.project,
            pb.name as budget_name,
            pbi.cost_head,
            pbi.description,
            pbi.budget_amount,
            pbi.committed_amount,
            pbi.actual_amount,
            pbi.remaining_balance
        FROM `tabProject Budget` pb
        INNER JOIN `tabProject Budget Item` pbi ON pbi.parent = pb.name
        WHERE {where_clause}
        ORDER BY pb.project, pbi.cost_head
        """,
		as_dict=True,
	)

	for row in data:
		row["percent_used"] = (
			((row.committed_amount or 0) + (row.actual_amount or 0)) / (row.budget_amount or 1) * 100
			if row.budget_amount
			else 0
		)

	return data
