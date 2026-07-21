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
		{"label": _("BOQ"), "fieldname": "name", "fieldtype": "Link", "options": "BOQ", "width": 180},
		{
			"label": _("Project"),
			"fieldname": "project",
			"fieldtype": "Link",
			"options": "Project",
			"width": 180,
		},
		{"label": _("Contract Type"), "fieldname": "contract_type", "fieldtype": "Data", "width": 120},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 100},
		{"label": _("Items"), "fieldname": "item_count", "fieldtype": "Int", "width": 80},
		{"label": _("Total Amount"), "fieldname": "total_amount", "fieldtype": "Currency", "width": 140},
		{"label": _("Estimated Cost"), "fieldname": "estimated_cost", "fieldtype": "Currency", "width": 140},
		{"label": _("Margin %"), "fieldname": "gross_margin_pct", "fieldtype": "Percent", "width": 100},
		{"label": _("Revision"), "fieldname": "revision", "fieldtype": "Int", "width": 80},
	]


def get_data(filters):
	conditions = []
	if filters and filters.get("project"):
		conditions.append(f"project = {frappe.db.escape(filters.project)}")
	if filters and filters.get("status"):
		conditions.append(f"status = {frappe.db.escape(filters.status)}")

	where_clause = " AND ".join(conditions) if conditions else "1=1"

	data = frappe.db.sql(
		f"""
        SELECT
            name, project, contract_type, status,
            total_amount, estimated_cost, actual_cost,
            budget_variance, gross_margin_pct, revision
        FROM `tabBOQ`
        WHERE {where_clause}
        ORDER BY creation DESC
        """,
		as_dict=True,
	)

	for row in data:
		row["item_count"] = frappe.db.count("BOQ Item", {"parent": row["name"]})

	return data
