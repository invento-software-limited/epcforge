# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.utils.nestedset import NestedSet


class BudgetCostHead(NestedSet):
	nsm_parent_field = "parent_cost_head"


def get_children(doctype, parent=None, **filters):
	"""Get children for Tree view"""
	filters = frappe._dict(filters)
	fields = ["name as value", "cost_head_name as title", "is_group as expandable"]

	if parent:
		filters.parent_cost_head = parent
	else:
		filters.parent_cost_head = ""

	return frappe.get_all("Budget Cost Head", fields=fields, filters=filters, order_by="lft asc")


def add_node():
	"""Add a new node in the tree"""
	doc = frappe.get_doc(
		{
			"doctype": "Budget Cost Head",
			"cost_head_name": frappe.form_dict.cost_head_name,
			"parent_cost_head": frappe.form_dict.parent_cost_head,
			"is_group": frappe.form_dict.is_group,
		}
	)
	doc.insert()
