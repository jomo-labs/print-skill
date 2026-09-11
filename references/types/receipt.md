# Receipt / expense report

**Portrait.** Professional, suitable for business submission.

*Functional requirements:* vendor name large and centered; address/phone small;
date + transaction # small; divider; line-items table (Item | Qty | Price |
Total, right-aligned amounts); Subtotal, Tax, Tip, TOTAL bold at bottom right;
payment method at bottom. From a photo: extract all text and rebuild it as a
clean structured receipt marked "Reconstructed from original receipt". Expense
report variant (multiple receipts or by name): a Date | Vendor | Category |
Amount | Purpose table with a total and `Employee: ______  Approved by: ______`
signature lines.

*Default styling:* label font throughout; amounts right-aligned on tabular
figures; `--border-hair` dividers.
