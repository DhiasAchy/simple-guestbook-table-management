// src/utils/printer.js

export const printGuestReceipt = (guest, eventInfo = { name: "Digital Guestbook" }) => {
  const dateStr = new Date().toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Format teks untuk printer thermal 58mm (lebar ideal ~32 karakter)
  const printText = 
`================================
   ${eventInfo.name.toUpperCase()}
================================
Tamu    : ${guest.name}
Kategori: ${guest.category || 'General'}
Jumlah  : ${guest.pax || 1} Pax
Meja    : ${guest.tableName || guest.tableId || 'Belum diatur'}
Waktu   : ${dateStr}
--------------------------------
Terima kasih atas kehadiran 
dan doa restu Anda.
================================
`;

  // Cek apakah menggunakan RawBT (Android protocol handler) atau fallback ke window.print
  try {
    // Format URI scheme untuk RawBT
    const encodedText = encodeURI(printText);
    const rawbtUrl = `rawbt:data:text/plain;charset=utf-8,${encodedText}`;
    
    // Coba buka protokol RawBT
    window.location.href = rawbtUrl;
  } catch (error) {
    console.warn("RawBT tidak terdeteksi, menggunakan cetak standar browser.", error);
    
    // Fallback: Cetak via browser window print
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    printWindow.document.write(`
      <html>
        <head>
          <title>Cetak Struk - ${guest.name}</title>
          <style>
            body { font-family: monospace; font-size: 12px; width: 200px; padding: 10px; }
            h3 { text-align: center; margin-bottom: 5px; }
            hr { border: dashed 1px #000; }
          </style>
        </head>
        <body>
          <h3>${eventInfo.name}</h3>
          <hr/>
          <p><strong>Tamu:</strong> ${guest.name}<br/>
          <strong>Kategori:</strong> ${guest.category || 'General'}<br/>
          <strong>Pax:</strong> ${guest.pax || 1}<br/>
          <strong>Meja:</strong> ${guest.tableName || '-'}<br/>
          <strong>Waktu:</strong> ${dateStr}</p>
          <hr/>
          <p style="text-align: center;">Terima kasih</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }
};