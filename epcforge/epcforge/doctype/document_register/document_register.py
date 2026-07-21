# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class DocumentRegister(Document):
	def before_submit(self):
		if self.status == "Draft":
			self.status = "Under Review"

	def before_cancel(self):
		self.status = "Cancelled"
