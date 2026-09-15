# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.utils.nestedset import NestedSet


class BOQGroup(NestedSet):
	nsm_parent_field = "parent_boq_group"


def get_children(doctype, parent=None, **filters):
	"""Get children for Tree view"""
	filters = frappe._dict(filters)
	fields = ["name as value", "boq_group_name as title", "is_group as expandable"]

	if parent:
		filters.parent_boq_group = parent
	else:
		filters.parent_boq_group = ""

	return frappe.get_all("BOQ Group", fields=fields, filters=filters, order_by="lft asc")


def add_node():
	"""Add a new node in the tree"""
	doc = frappe.get_doc(
		{
			"doctype": "BOQ Group",
			"boq_group_name": frappe.form_dict.boq_group_name,
			"parent_boq_group": frappe.form_dict.parent_boq_group,
			"is_group": frappe.form_dict.is_group,
		}
	)
	doc.insert()
