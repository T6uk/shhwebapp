// app/static/js/modules/export.js
// Export functionality

// Export to Excel functionality
function exportToExcel() {
    if (!AppState.gridApi) return;

    const params = {
        fileName: 'Suur_Andmetabel_Export.xlsx',
        processCellCallback: function(params) {
            // Clean up cell values if needed
            return params.value;
        }
    };

    AppState.gridApi.exportDataAsExcel(params);
}

// Export to PDF functionality (uses browser print with styling)
function exportToPDF() {
    if (!AppState.gridApi) return;

    // Create a hidden iframe to handle printing without affecting the current page
    const printFrame = document.createElement('iframe');
    printFrame.style.display = 'none';
    document.body.appendChild(printFrame);

    // Build a new document with just the table data
    const doc = printFrame.contentWindow.document;
    doc.open();

    // Add necessary styles
    doc.write(`
        <!DOCTYPE html>
        <html lang="ee">
        <head>
            <title>Suur Andmetabel - Eksport</title>
            <style>
                body {
                    font-family: 'Inter', sans-serif;
                    color: #1e293b;
                    margin: 20px;
                }
                h1 {
                    font-size: 18px;
                    margin-bottom: 10px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                th {
                    background-color: #f1f5f9;
                    padding: 8px;
                    text-align: left;
                    font-weight: 600;
                    border-bottom: 2px solid #e2e8f0;
                }
                td {
                    padding: 8px;
                    border-bottom: 1px solid #e2e8f0;
                }
                tr:nth-child(even) {
                    background-color: #f8fafc;
                }
                @media print {
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
            </style>
        </head>
        <body>
            <h1>Suur Andmetabel - Eksporditud ${new Date().toLocaleString('et-EE')}</h1>
    `);

    // Create table with visible columns and rows
    doc.write('<table>');

    // Table header
    doc.write('<thead><tr>');
    const visibleColumns = AppState.gridApi.getAllDisplayedColumns();
    visibleColumns.forEach(column => {
        const headerName = column.getColDef().headerName || column.getColDef().field;
        doc.write(`<th>${headerName}</th>`);
    });
    doc.write('</tr></thead>');

    // Table body
    doc.write('<tbody>');
    AppState.gridApi.forEachNodeAfterFilterAndSort(rowNode => {
        doc.write('<tr>');
        visibleColumns.forEach(column => {
            const field = column.getColDef().field;
            const value = rowNode.data[field] || '';
            doc.write(`<td>${value}</td>`);
        });
        doc.write('</tr>');
    });
    doc.write('</tbody></table>');

    doc.write('</body></html>');
    doc.close();

    // Print the document
    printFrame.contentWindow.focus();
    printFrame.contentWindow.print();

    // Remove the iframe after printing
    setTimeout(() => {
        document.body.removeChild(printFrame);
    }, 1000);
}

// Export functions for other modules
window.exportToExcel = exportToExcel;
window.exportToPDF = exportToPDF;