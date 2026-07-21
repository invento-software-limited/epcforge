# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class Tender(Document):
	def before_save(self):
		self.update_bidder_counts()

	def before_submit(self):
		if self.status not in ("Published", "Under Evaluation", "Awarded"):
			self.status = "Published"

	def on_submit(self):
		self.status = "Published"

	def before_cancel(self):
		self.status = "Cancelled"

	def update_bidder_counts(self):
		"""Update bidder counts from the child table"""
		total = 0
		submitted = 0

		for bidder in self.invited_bidders:
			total += 1
			if bidder.bid_status == "Quotation Submitted":
				submitted += 1
			if bidder.bid_status == "Awarded":
				self.awarded_to = bidder.supplier
				self.award_amount = bidder.bid_amount

		self.bidder_count = total
		self.quotes_received = submitted

		# Find lowest bidder
		lowest_amount = None
		lowest_supplier = None
		for bidder in self.invited_bidders:
			if bidder.bid_amount and bidder.bid_amount > 0:
				if lowest_amount is None or bidder.bid_amount < lowest_amount:
					lowest_amount = bidder.bid_amount
					lowest_supplier = bidder.supplier

		if lowest_supplier:
			self.lowest_bidder = lowest_supplier
			self.lowest_bid_amount = lowest_amount
