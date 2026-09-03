#!/bin/sh
# Dump the raw evidence out of an xlsx zip. Same command is used for before, after and oracles.
f="$1"
echo "########## $f"
echo "--- zip entries ---"
unzip -Z1 "$f" | sort
echo "--- sharedStrings.xml present? ---"
if unzip -Z1 "$f" | grep -q 'xl/sharedStrings.xml'; then
  echo "PRESENT"; unzip -p "$f" xl/sharedStrings.xml
else
  echo "ABSENT"
fi
echo ""
echo "--- workbook.xml <sheet name=> ---"
unzip -p "$f" xl/workbook.xml | grep -o '<sheet [^>]*>'
echo "--- sheetData (raw) ---"
unzip -p "$f" xl/worksheets/sheet1.xml | sed -e 's/.*<sheetData>//' -e 's/<\/sheetData>.*//'
echo ""
echo "--- t=\"str\" occurrences: $(unzip -p "$f" xl/worksheets/sheet1.xml | grep -o 't="str"' | wc -l) ---"
echo "--- t=\"s\"   occurrences: $(unzip -p "$f" xl/worksheets/sheet1.xml | grep -o 't="s"' | wc -l) ---"
echo ""
