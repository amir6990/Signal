"""Rewrite column U of the Options sheet with the nested-IF form (no #VALUE! when the underlying price is missing)."""
import sys, re, warnings
warnings.filterwarnings('ignore')
from openpyxl import load_workbook
p = sys.argv[1]; wb = load_workbook(p); ws = wb['Options']; n = 0
for r in range(5, ws.max_row + 1):
    v = ws.cell(row=r, column=21).value
    if isinstance(v, str) and v.startswith('=IF(OR($P%d=""' % r):
        ws.cell(row=r, column=21).value = ('=IF($A{r}="","",IF($P{r}="","",IF(ABS($P{r}-1)>3*OPT_ATM_BAND,"",'
                                           'IFERROR($I{r}/$O{r}*SQRT(2*PI()/$T{r}),""))))').format(r=r)
        n += 1
    elif isinstance(v, str) and v.startswith('=IF($A%d="","",IF(OR($P%d=""' % (r, r)):
        ws.cell(row=r, column=21).value = ('=IF($A{r}="","",IF($P{r}="","",IF(ABS($P{r}-1)>3*OPT_ATM_BAND,"",'
                                           'IFERROR($I{r}/$O{r}*SQRT(2*PI()/$T{r}),""))))').format(r=r)
        n += 1
wb.save(p); print('fixed', n)
