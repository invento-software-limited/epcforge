import frappe
from frappe import _
from frappe.model.document import Document


class EPCForgeSettings(Document):
	"""EPCForge global settings — app-wide defaults and configuration."""

	def validate(self):
		self.validate_email_settings()

	def validate_email_settings(self):
		if self.enable_email_notifications and not self.notification_sender_email:
			frappe.msgprint(
				_("Email notifications are enabled but no sender email is set."),
				alert=True,
			)

	@staticmethod
	def get_default(name):
		"""Convenience helper to get a setting value or None."""
		return frappe.db.get_single_value("EPCForge Settings", name)


def send_epc_notification(subject, message, recipients):
	"""Send an email via EPCForge Settings, if notifications are enabled.
	Never raises - a notification failure must not block the document
	action (Tender submit, Document Register submit, ...) that triggered it.
	"""
	if not recipients:
		return
	if not EPCForgeSettings.get_default("enable_email_notifications"):
		return

	sender_email = EPCForgeSettings.get_default("notification_sender_email")
	sender_name = EPCForgeSettings.get_default("notification_sender_name")
	sender = f"{sender_name} <{sender_email}>" if sender_name and sender_email else sender_email or None

	try:
		frappe.sendmail(recipients=recipients, subject=subject, message=message, sender=sender, now=False)
	except Exception:
		frappe.log_error(title="EPCForge Notification Failed")
