import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeCanvas } from 'qrcode.react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  runTransaction,
  writeBatch,
  getDoc
} from 'firebase/firestore';
import { db } from './firebase';

export default function EventApp() {
  const [currentRole, setCurrentRole] = useState('usher');
  const [eventMode, setEventMode] = useState('mode1');

  const [guestList, setGuestList] = useState([]);
  const [masterTables, setMasterTables] = useState([]);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);
  const [isLoading, setIsLoading] = useState(true);

  // State khusus Public Ticket View (?ticket=ID)
  const [ticketParam, setTicketParam] = useState(null);
  const [publicGuest, setPublicGuest] = useState(null);

  // State untuk Usher
  const [searchQuery, setSearchQuery] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [bluetoothDevice, setBluetoothDevice] = useState(null);
  const [printStatus, setPrintStatus] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState('checkin');
  const [editingGuestId, setEditingGuestId] = useState(null);
  const [selectedTableDropdown, setSelectedTableDropdown] = useState('');
  const [cameraError, setCameraError] = useState('');
  const qrScannerRef = useRef(null);

  // State untuk Admin
  const [newGuest, setNewGuest] = useState({ name: '', category: 'Reguler', phone: '', email: '', table: '' });
  const [newTable, setNewTable] = useState({ name: '', capacity: 8, category: 'Reguler', shape: 'kotak', x: 100, y: 100 });
  const [adminSearch, setAdminSearch] = useState('');

  // State Modal QR & Template WhatsApp
  const [selectedQrGuest, setSelectedQrGuest] = useState(null);
  const [waTemplate, setWaTemplate] = useState(
    "Halo Bapak/Ibu *{nama}*,\n\nKami mengundang Anda untuk hadir di acara kami.\n\nSilakan akses E-Ticket & QR Code undangan Anda melalui tautan berikut:\n{link_ticket}\n\nHarap tunjukkan QR Code tersebut pada petugas di pintu masuk. Terima kasih!"
  );

  // State untuk Drag & Drop Denah Luas (Mode 1)
  const [draggingTable, setDraggingTable] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const floorRef = useRef(null);

  // --- CEK URL PARAMETER (?ticket=ID) & REAL-TIME LISTENER ---
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tId = urlParams.get('ticket');
    if (tId) {
      setTicketParam(tId);
      getDoc(doc(db, 'guests', tId)).then((docSnap) => {
        if (docSnap.exists()) {
          setPublicGuest({ id: docSnap.id, ...docSnap.data() });
        }
        setIsLoading(false);
      });
      return;
    }

    const unsubConfig = onSnapshot(doc(db, 'settings', 'eventConfig'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setEventMode(data.mode || 'mode1');
        if (data.waTemplate) setWaTemplate(data.waTemplate);
      } else {
        setDoc(doc(db, 'settings', 'eventConfig'), { mode: 'mode1', waTemplate });
      }
    });

    const unsubTables = onSnapshot(
      collection(db, 'tables'),
      { includeMetadataChanges: true },
      (snapshot) => {
        const tablesData = snapshot.docs.map(d => ({
          ...d.data(),
          id: d.id,
          isPendingSync: d.metadata.hasPendingWrites
        }));
        setMasterTables(tablesData);
        if (tablesData.length > 0 && !newGuest.table) {
          setNewGuest(prev => ({ ...prev, table: tablesData[0].name }));
        }
      }
    );

    const unsubGuests = onSnapshot(
      collection(db, 'guests'),
      { includeMetadataChanges: true },
      (snapshot) => {
        const guestsData = snapshot.docs.map(d => ({
          ...d.data(),
          id: d.id,
          isPendingSync: d.metadata.hasPendingWrites
        }));
        setGuestList(guestsData);
        setIsLoading(false);
      }
    );

    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubConfig();
      unsubTables();
      unsubGuests();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSeedInitialData = async () => {
    const batch = writeBatch(db);

    const sampleTables = [
      { name: 'Meja VIP 01', capacity: 2, category: 'VIP', shape: 'lingkaran', x: 80, y: 80 },
      { name: 'Meja VIP 02', capacity: 2, category: 'VIP', shape: 'lingkaran', x: 320, y: 80 },
      { name: 'Meja Keluarga 02', capacity: 4, category: 'Keluarga', shape: 'kotak', x: 560, y: 80 },
      { name: 'Area Reguler Umum', capacity: 500, category: 'Reguler', shape: 'kotak', x: 80, y: 300 }
    ];
    sampleTables.forEach(t => batch.set(doc(db, 'tables', t.name), t));

    const sampleGuests = [
      { id: 'G-001', name: 'Budi Santoso & Partner', category: 'VIP', phone: '081234567890', email: 'budi@example.com', table: 'Meja VIP 01', status: 'Belum Hadir', checkInTime: '-' },
      { id: 'G-002', name: 'Siti Rahma', category: 'Reguler', phone: '081987654321', email: 'siti@example.com', table: 'Area Reguler Umum', status: 'Belum Hadir', checkInTime: '-' },
      { id: 'G-003', name: 'Andi Pratama & Keluarga', category: 'Keluarga', phone: '081122334455', email: 'andi@example.com', table: 'Meja Keluarga 02', status: 'Belum Hadir', checkInTime: '-' }
    ];
    sampleGuests.forEach(g => batch.set(doc(db, 'guests', g.id), g));

    await batch.commit();
    alert('Data simulasi awal berhasil dimuat ke Cloud Firestore!');
  };

  const handleModeChange = async (mode) => {
    setEventMode(mode);
    await setDoc(doc(db, 'settings', 'eventConfig'), { mode }, { merge: true });
  };

  const handleSaveWaTemplate = async () => {
    await setDoc(doc(db, 'settings', 'eventConfig'), { waTemplate }, { merge: true });
    alert('Templat pesan WhatsApp berhasil disimpan!');
  };

  const getTicketUrl = (guestId) => {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?ticket=${guestId}`;
  };

  const handleSendWhatsApp = (guest) => {
    if (!guest.phone || guest.phone === '-') {
      alert(`Nomor HP untuk tamu "${guest.name}" belum diisi!`);
      return;
    }
    let cleanPhone = guest.phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);

    const ticketLink = getTicketUrl(guest.id);
    const compiledMessage = waTemplate
      .replace(/{nama}/g, guest.name)
      .replace(/{id}/g, guest.id)
      .replace(/{kategori}/g, guest.category)
      .replace(/{link_ticket}/g, ticketLink);

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(compiledMessage)}`, '_blank');
  };

  const handleSendEmail = (guest) => {
    if (!guest.email || guest.email === '-') {
      alert(`Alamat email untuk tamu "${guest.name}" belum diisi!`);
      return;
    }
    const ticketLink = getTicketUrl(guest.id);
    const subject = encodeURIComponent(`E-Ticket Undangan Resmi — ${guest.name}`);
    const body = encodeURIComponent(
      `Yth. Bapak/Ibu ${guest.name},\n\nTerima kasih atas konfirmasi Anda. Berikut adalah tautan eksklusif E-Ticket & QR Code akses masuk Anda:\n\n${ticketLink}\n\nMohon tunjukkan QR Code pada tautan di atas kepada petugas di lokasi acara.\n\nSalam hangat,\nPanitia Acara`
    );
    window.location.href = `mailto:${guest.email}?subject=${subject}&body=${body}`;
  };

  // Fitur Download Kartu QR PNG
  const handleDownloadQrCard = (guest) => {
    const qrCanvas = document.getElementById('qr-gen-canvas');
    if (!qrCanvas) return;

    const cardCanvas = document.createElement('canvas');
    const ctx = cardCanvas.getContext('2d');
    cardCanvas.width = 400;
    cardCanvas.height = 520;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cardCanvas.width, cardCanvas.height);

    ctx.strokeStyle = '#d6d3d1';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, cardCanvas.width - 24, cardCanvas.height - 24);

    ctx.fillStyle = '#1c1917';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KARTU AKSES TAMU UNDANGAN', cardCanvas.width / 2, 55);

    ctx.drawImage(qrCanvas, 80, 85, 240, 240);

    ctx.fillStyle = '#57534e';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`ID: ${guest.id}`, cardCanvas.width / 2, 355);

    ctx.fillStyle = '#1c1917';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(guest.name, cardCanvas.width / 2, 395);

    ctx.fillStyle = '#44403c';
    ctx.font = '15px sans-serif';
    const subInfo = eventMode === 'mode1'
      ? `${guest.category} • ${guest.table}`
      : `Kategori: ${guest.category}`;
    ctx.fillText(subInfo, cardCanvas.width / 2, 428);

    ctx.fillStyle = '#78716c';
    ctx.font = '12px sans-serif';
    ctx.fillText('Tunjukkan QR ini di meja penerima tamu', cardCanvas.width / 2, 475);

    const pngUrl = cardCanvas.toDataURL('image/png');
    const downloadLink = document.createElement('a');
    downloadLink.href = pngUrl;
    const safeFileName = guest.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    downloadLink.download = `QR_${guest.id}_${safeFileName}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const lines = text.split('\n');
      const batch = writeBatch(db);
      let count = 0;

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].trim();
        if (!row) continue;
        const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

        if (cols.length >= 2) {
          const guestId = `G-${Date.now().toString().slice(-4)}-${i}`;
          const guestObj = {
            id: guestId,
            name: cols[0],
            category: cols[1] || 'Reguler',
            phone: cols[2] || '-',
            email: cols[3] || '-',
            table: cols[4] || (masterTables[0]?.name || 'Area Reguler Umum'),
            status: 'Belum Hadir',
            checkInTime: '-'
          };
          batch.set(doc(db, 'guests', guestId), guestObj);
          count++;
        }
      }

      if (count > 0) {
        await batch.commit();
        alert(`Berhasil mengimpor ${count} data tamu ke Cloud!`);
      } else {
        alert('Format file CSV tidak valid.');
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  // --- INTEGRASI PRINTER THERMAL 58mm (RAWBT / BROWSER) ---
  const printReceipt = (guest) => {
    const dateStr = new Date().toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const printText =
      `================================
   DIGITAL GUESTBOOK INVITATION
================================
Tamu    : ${guest.name}
Kategori: ${guest.category || 'General'}
Jumlah  : ${guest.pax || 1} Pax
Meja    : ${guest.table || 'Belum diatur'}
Waktu   : ${dateStr}
--------------------------------
Terima kasih atas kehadiran 
dan doa restu Anda.
================================
`;

    if (bluetoothDevice) {
      setPrintStatus(`Mencetak struk untuk ${guest.name}...`);
      return;
    }

    try {
      const encodedText = encodeURI(printText);
      const rawbtUrl = `rawbt:data:text/plain;charset=utf-8,${encodedText}`;
      window.location.href = rawbtUrl;
    } catch (error) {
      console.warn("RawBT tidak terdeteksi, menggunakan cetak standar browser.", error);
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
            <h3>Digital Guestbook</h3>
            <hr/>
            <p><strong>Tamu:</strong> ${guest.name}<br/>
            <strong>Kategori:</strong> ${guest.category || 'General'}<br/>
            <strong>Meja:</strong> ${guest.table || '-'}<br/>
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

  // --- LOGIKA DRAG & DROP KANVAS LUAS (MODE 1) ---
  const handleMouseDown = (e, tableName) => {
    e.stopPropagation();
    const table = masterTables.find(t => t.name === tableName);
    if (!table || !floorRef.current) return;

    const rect = floorRef.current.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    setDraggingTable(tableName);
    setDragOffset({
      x: clientX - rect.left - (table.x || 0) + floorRef.current.scrollLeft,
      y: clientY - rect.top - (table.y || 0) + floorRef.current.scrollTop
    });
  };

  const handleMouseMove = (e) => {
    if (!draggingTable || !floorRef.current) return;
    const rect = floorRef.current.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    let newX = Math.max(0, clientX - rect.left - dragOffset.x + floorRef.current.scrollLeft);
    let newY = Math.max(0, clientY - rect.top - dragOffset.y + floorRef.current.scrollTop);

    setMasterTables(prev => prev.map(t => t.name === draggingTable ? { ...t, x: newX, y: newY } : t));
  };

  const handleMouseUp = async () => {
    if (draggingTable) {
      const movedTable = masterTables.find(t => t.name === draggingTable);
      setDraggingTable(null);
      if (movedTable) {
        await setDoc(doc(db, 'tables', movedTable.name), { x: movedTable.x, y: movedTable.y }, { merge: true });
      }
    }
  };

  // --- LOGIKA KAMERA SCANNER LANGSUNG (Html5Qrcode Core) ---
  const stopCamera = async () => {
    if (qrScannerRef.current) {
      try {
        if (qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
        }
        qrScannerRef.current.clear();
      } catch (err) {
        console.warn("Stop camera warning:", err);
      }
      qrScannerRef.current = null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const startCamera = async () => {
      if (currentRole !== 'usher' || !isScanning) {
        await stopCamera();
        return;
      }

      setCameraError('');
      await stopCamera();

      await new Promise(resolve => setTimeout(resolve, 300));
      if (!isMounted || !document.getElementById('reader')) return;

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Browser Anda tidak mendukung akses kamera langsung.");
        }

        const html5QrCode = new Html5Qrcode("reader");
        qrScannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          async (decodedText) => {
            await stopCamera();
            if (isMounted) setIsScanning(false);
            processCheckIn(decodedText);
          },
          () => { }
        );
      } catch (err) {
        console.error("Camera start error:", err);
        if (isMounted) {
          setCameraError(
            "Kamera tidak dapat diakses. Pastikan izin kamera diizinkan (Allow) dan aplikasi dibuka lewat localhost atau HTTPS."
          );
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [currentRole, isScanning]);

  const getTableOccupancy = (tableName) => {
    const seatedGuests = guestList.filter(g => g.table === tableName && g.status === 'Sudah Hadir');
    const tableInfo = masterTables.find(t => t.name === tableName);
    const maxCap = tableInfo ? tableInfo.capacity : 50;
    return { count: seatedGuests.length, max: maxCap, isFull: seatedGuests.length >= maxCap, seatedGuests };
  };

  const connectBluetoothPrinter = async () => {
    try {
      setPrintStatus('Mencari printer bluetooth...');
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });
      setBluetoothDevice(device);
      setPrintStatus(`Terhubung: ${device.name || 'Printer Thermal'}`);
    } catch (error) {
      setPrintStatus('Koneksi printer dibatalkan / gagal.');
    }
  };

  const processCheckIn = async (guestIdentifier, customTable = null) => {
    let cleanId = guestIdentifier;
    if (guestIdentifier.includes('?ticket=')) {
      const parts = guestIdentifier.split('?ticket=');
      cleanId = parts[1];
    }

    const target = guestList.find(g =>
      g.id.toLowerCase() === cleanId.toLowerCase() ||
      g.name.toLowerCase() === cleanId.toLowerCase() ||
      g.phone === cleanId
    );

    if (!target) {
      alert(`Tamu dengan identitas/QR "${cleanId}" tidak ditemukan di database!`);
      return;
    }

    const assignedTable = customTable || target.table;
    const checkInTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const guestRef = doc(db, 'guests', target.id);

    const occupancy = getTableOccupancy(assignedTable);
    if (eventMode === 'mode1' && !customTable && occupancy.isFull && target.status === 'Belum Hadir') {
      const forceCheckIn = window.confirm(`Peringatan: ${assignedTable} sudah PENUH (${occupancy.count}/${occupancy.max}). Tetap alokasikan?`);
      if (!forceCheckIn) return;
    }

    try {
      if (isOfflineMode) {
        await setDoc(guestRef, {
          status: 'Sudah Hadir',
          table: assignedTable,
          checkInTime,
          updatedAt: Date.now()
        }, { merge: true });

        const updatedOffline = { ...target, table: assignedTable, status: 'Sudah Hadir', checkInTime, isPendingSync: true };
        setScanResult(updatedOffline);
        printReceipt(updatedOffline);
      } else {
        await runTransaction(db, async (transaction) => {
          const freshGuestDoc = await transaction.get(guestRef);
          if (!freshGuestDoc.exists()) throw "Data tamu tidak ditemukan di server!";

          const freshData = freshGuestDoc.data();
          if (freshData.status === 'Sudah Hadir' && !customTable) {
            const confirmDuplicate = window.confirm(`Info: Tamu ${freshData.name} BARU SAJA check-in di perangkat petugas lain pukul ${freshData.checkInTime}. Tetap perbarui data?`);
            if (!confirmDuplicate) return;
          }

          transaction.update(guestRef, {
            status: 'Sudah Hadir',
            table: assignedTable,
            checkInTime,
            updatedAt: Date.now()
          });
        });

        const updatedOnline = { ...target, table: assignedTable, status: 'Sudah Hadir', checkInTime, isPendingSync: false };
        setScanResult(updatedOnline);
        printReceipt(updatedOnline);
      }

      setSearchQuery('');
      setIsScanning(false);
      setEditingGuestId(null);
    } catch (error) {
      console.error("Gagal memproses check-in:", error);
      alert(`Terjadi kendala sinkronisasi: ${error}`);
    }
  };

  const handleSaveDropdownTable = (guestId) => {
    if (!selectedTableDropdown) return;
    processCheckIn(guestId, selectedTableDropdown);
    setSelectedTableDropdown('');
  };

  // --- LOGIKA ADMIN ---
  const handleAddGuest = async (e) => {
    e.preventDefault();
    if (!newGuest.name.trim()) return;
    const newId = `G-${Date.now().toString().slice(-5)}`;
    const guestObj = {
      id: newId,
      name: newGuest.name,
      category: newGuest.category,
      phone: newGuest.phone || '-',
      email: newGuest.email || '-',
      table: eventMode === 'mode1' ? (newGuest.table || masterTables[0]?.name || 'Area Reguler Umum') : 'Area Umum',
      status: 'Belum Hadir',
      checkInTime: '-'
    };
    await setDoc(doc(db, 'guests', newId), guestObj);
    setNewGuest({ name: '', category: 'Reguler', phone: '', email: '', table: masterTables[0]?.name || 'Area Reguler Umum' });
  };

  const handleAddTable = async (e) => {
    e.preventDefault();
    if (!newTable.name.trim()) return;
    if (masterTables.some(t => t.name.toLowerCase() === newTable.name.toLowerCase())) {
      alert('Nama meja sudah ada!');
      return;
    }
    await setDoc(doc(db, 'tables', newTable.name), newTable);
    setNewTable({ name: '', capacity: 8, category: 'Reguler', shape: 'kotak', x: 100, y: 100 });
  };

  const handleDeleteGuest = async (id) => {
    if (window.confirm('Hapus tamu ini dari Cloud?')) {
      await deleteDoc(doc(db, 'guests', id));
    }
  };

  const handleDeleteTable = async (tableName) => {
    if (window.confirm(`Hapus ${tableName} dari Cloud?`)) {
      await deleteDoc(doc(db, 'tables', tableName));
    }
  };

  const handleResetAllCheckIns = async () => {
    if (!window.confirm('Reset status kehadiran semua tamu menjadi "Belum Hadir" untuk simulasi ulang?')) return;
    const batch = writeBatch(db);
    guestList.forEach(g => {
      batch.update(doc(db, 'guests', g.id), { status: 'Belum Hadir', checkInTime: '-' });
    });
    await batch.commit();
    setScanResult(null);
  };

  const getCategoryBadge = (category) => {
    switch (category) {
      case 'VIP': return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'Keluarga': return 'bg-stone-200 text-stone-800 border border-stone-300';
      default: return 'bg-zinc-100 text-zinc-700 border border-zinc-200';
    }
  };

  const filteredGuests = searchQuery.trim() === '' ? [] : guestList.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.phone.includes(searchQuery)
  );

  const filteredAdminGuests = guestList.filter(g =>
    g.name.toLowerCase().includes(adminSearch.toLowerCase()) ||
    g.id.toLowerCase().includes(adminSearch.toLowerCase()) ||
    g.phone.includes(adminSearch)
  );

  const arrivedCount = guestList.filter(g => g.status === 'Sudah Hadir').length;
  const pendingSyncCount = guestList.filter(g => g.isPendingSync).length;

  if (ticketParam) {
    return (
      <div className="w-full min-h-screen bg-stone-100 flex items-center justify-center p-4 font-sans text-stone-800">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200/80 p-6 text-center">
          {isLoading ? (
            <p className="text-xs text-stone-400 py-12">Memuat E-Ticket Undangan...</p>
          ) : publicGuest ? (
            <div>
              <span className="text-[10px] font-bold tracking-widest uppercase text-stone-400">E-Ticket Undangan Resmi</span>
              <h1 className="text-xl font-bold text-stone-900 mt-2">{publicGuest.name}</h1>
              <div className="flex justify-center gap-2 mt-2">
                <span className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full ${getCategoryBadge(publicGuest.category)}`}>
                  {publicGuest.category}
                </span>
                {publicGuest.table && (
                  <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-800 border border-stone-200">
                    {publicGuest.table}
                  </span>
                )}
              </div>

              <div className="bg-stone-50 p-6 rounded-2xl border border-stone-200 my-6 inline-flex flex-col items-center justify-center shadow-inner">
                <QRCodeCanvas
                  value={publicGuest.id}
                  size={220}
                  level="H"
                  includeMargin={true}
                />
                <span className="font-mono text-xs font-bold text-stone-700 mt-3">{publicGuest.id}</span>
              </div>

              <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-xl text-left text-xs space-y-1 text-stone-600 mb-6">
                <p>📌 <b>Petunjuk:</b></p>
                <p>• Harap tunjukkan QR Code di atas kepada petugas (Usher) saat tiba di pintu masuk lokasi acara.</p>
                <p>• E-Ticket ini berlaku untuk satu kali kedatangan.</p>
              </div>

              <a
                href={window.location.origin + window.location.pathname}
                className="block w-full bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold py-3 rounded-xl transition text-center"
              >
                Kembali ke Beranda Utama
              </a>
            </div>
          ) : (
            <div className="py-8">
              <h2 className="text-base font-bold text-rose-600 mb-2">E-Ticket Tidak Ditemukan</h2>
              <p className="text-xs text-stone-500 mb-6">Maaf, tautan tiket undangan yang Anda buka tidak valid atau sudah dihapus.</p>
              <a
                href={window.location.origin + window.location.pathname}
                className="inline-block bg-stone-900 text-white text-xs font-semibold px-5 py-2.5 rounded-xl"
              >
                Ke Beranda
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-stone-100 flex justify-center items-center p-2 sm:p-6 font-sans antialiased text-stone-800">

      <div className={`w-full bg-white shadow-xl border border-stone-200/80 flex flex-col justify-between p-5 box-border transition-all duration-300 ${currentRole === 'usher'
        ? 'max-w-xl min-h-screen sm:min-h-[920px] sm:rounded-3xl'
        : 'max-w-7xl min-h-[920px] rounded-2xl'
        }`}>

        <div>
          {/* Top Bar */}
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 mb-6 pb-4 border-b border-stone-100">
            <div className="bg-stone-900 text-stone-300 p-1 rounded-xl flex shadow-sm w-full lg:w-auto">
              <button
                onClick={() => setCurrentRole('usher')}
                className={`flex-1 lg:flex-none px-6 py-2 text-xs font-medium rounded-lg transition ${currentRole === 'usher' ? 'bg-stone-100 text-stone-900 shadow-sm' : 'hover:text-white'}`}
              >
                Usher App
              </button>
              <button
                onClick={() => setCurrentRole('admin')}
                className={`flex-1 lg:flex-none px-6 py-2 text-xs font-medium rounded-lg transition ${currentRole === 'admin' ? 'bg-stone-100 text-stone-900 shadow-sm' : 'hover:text-white'}`}
              >
                Admin Dashboard
              </button>
            </div>

            {currentRole === 'admin' && (
              <div className="flex items-center gap-2 bg-stone-50 border border-stone-200/80 px-3 py-2 rounded-xl w-full lg:w-auto justify-between lg:justify-start">
                <span className="text-xs text-stone-500 font-medium whitespace-nowrap">Model Acara:</span>
                <select
                  value={eventMode}
                  onChange={(e) => handleModeChange(e.target.value)}
                  className="text-xs bg-white border border-stone-200 px-3 py-1.5 rounded-lg font-semibold text-stone-900 focus:outline-none"
                >
                  <option value="mode1">Mode 1: Denah Meja Interaktif (Custom Setup)</option>
                  <option value="mode2">Mode 2: Standar (Tanpa Meja Spesifik)</option>
                </select>
              </div>
            )}
          </div>

          {/* Banner Offline / Pending Sync */}
          {(isOfflineMode || pendingSyncCount > 0) && (
            <div className={`mb-4 p-3 rounded-xl border text-xs flex justify-between items-center ${isOfflineMode
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}>
              <div>
                <span className="font-bold">
                  {isOfflineMode ? '⚠️ Mode Offline Aktif: ' : '🔄 Menyinkronkan ke Cloud: '}
                </span>
                <span>
                  {isOfflineMode
                    ? 'Sinyal terputus. Scan tetap berjalan dan tersimpan aman di memori HP.'
                    : `Mengirim ${pendingSyncCount} data antrean ke server...`}
                </span>
              </div>
              {pendingSyncCount > 0 && (
                <span className="bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full text-[10px]">
                  {pendingSyncCount} Antre
                </span>
              )}
            </div>
          )}

          {/* ================= TAMPILAN USHER ================= */}
          {currentRole === 'usher' ? (
            <>
              <header className="bg-stone-50 border border-stone-200/60 p-4 rounded-2xl mb-4 flex justify-between items-center">
                <div>
                  <h1 className="font-semibold text-sm text-stone-900 tracking-tight">Portal Usher Check-In</h1>
                  <p className="text-[11px] text-stone-500">
                    {eventMode === 'mode1' ? 'Cloud Sync • Penentuan Meja Aktif' : 'Cloud Sync • Standar'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full ${isOfflineMode ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                    {isOfflineMode ? '● Offline (Local Cache)' : '● Cloud Terhubung'}
                  </span>
                  <button onClick={connectBluetoothPrinter} className="text-[10px] text-stone-500 hover:text-stone-800 underline">
                    {bluetoothDevice ? 'Printer Connected' : 'Connect Printer'}
                  </button>
                </div>
              </header>

              {printStatus && (
                <div className="bg-stone-100 border border-stone-200 text-stone-700 text-xs p-2.5 rounded-xl mb-4 text-center">
                  {printStatus}
                </div>
              )}

              <div className="flex bg-stone-100 p-1 rounded-xl mb-4">
                <button
                  onClick={() => setActiveTab('checkin')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition ${activeTab === 'checkin' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
                >
                  Scanner & Check-In
                </button>
                <button
                  onClick={() => setActiveTab('log')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition ${activeTab === 'log' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
                >
                  Log Hadir ({arrivedCount})
                </button>
              </div>

              {activeTab === 'checkin' ? (
                <>
                  <div className="bg-stone-50 border border-stone-200/60 p-4 rounded-2xl mb-4">
                    <button
                      onClick={() => setIsScanning(!isScanning)}
                      className={`w-full py-2.5 rounded-xl font-medium text-xs flex items-center justify-center gap-2 mb-3 transition ${isScanning ? 'bg-rose-600 text-white' : 'bg-stone-900 text-white hover:bg-stone-800'}`}
                    >
                      <span>📷</span> {isScanning ? 'Tutup Kamera Scanner' : 'Scan QR Code'}
                    </button>

                    {isScanning && (
                      <div className="mb-4 bg-stone-900 rounded-xl p-3 text-white">
                        {cameraError ? (
                          <div className="bg-rose-950 border border-rose-700 text-rose-200 text-xs p-3 rounded-lg mb-2 text-center">
                            {cameraError}
                          </div>
                        ) : (
                          <div id="reader" className="w-full overflow-hidden rounded-lg bg-black min-h-[260px]"></div>
                        )}
                        <p className="text-[10px] text-center text-stone-400 mt-2">Atau gunakan simulasi klik cepat di bawah jika kamera tidak tersedia:</p>
                        <div className="flex gap-1.5 flex-wrap justify-center mt-2">
                          {guestList.map(g => (
                            <button
                              key={g.id}
                              onClick={() => processCheckIn(g.id)}
                              className={`text-[10px] px-2.5 py-1 rounded font-medium ${g.status === 'Sudah Hadir' ? 'bg-emerald-800 text-emerald-100' : 'bg-stone-700 hover:bg-stone-600 text-white'}`}
                            >
                              {g.name.split(' ')[0]} {g.status === 'Sudah Hadir' && '✓'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <label className="block text-[11px] font-medium text-stone-600 uppercase tracking-wide mb-1.5">
                      Pencarian Tamu (Nama / ID / No. HP)
                    </label>
                    <input
                      type="text"
                      placeholder="Cari Budi, G-001, 0812..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-stone-400"
                    />

                    {filteredGuests.length > 0 && (
                      <div className="mt-3 divide-y divide-stone-100 max-h-60 overflow-y-auto">
                        {filteredGuests.map(guest => {
                          const occupancy = getTableOccupancy(guest.table);
                          return (
                            <div key={guest.id} className="py-3 flex flex-col gap-2">
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-xs text-stone-900">{guest.name}</p>
                                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${getCategoryBadge(guest.category)}`}>
                                      {guest.category}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-stone-500 mt-0.5">
                                    ID: {guest.id} • 📱 {guest.phone} {eventMode === 'mode1' && `• Meja: ${guest.table}`}
                                  </p>
                                  {guest.status === 'Sudah Hadir' && (
                                    <p className="text-[10px] font-semibold text-emerald-700 mt-0.5">
                                      ✓ Sudah Check-In pukul {guest.checkInTime} {guest.isPendingSync && '(Menunggu Sinyal Sync)'}
                                    </p>
                                  )}
                                  {eventMode === 'mode1' && (
                                    <p className={`text-[10px] font-medium mt-0.5 ${occupancy.isFull ? 'text-rose-600' : 'text-emerald-600'}`}>
                                      {occupancy.isFull ? `⚠️ Penuh (${occupancy.count}/${occupancy.max})` : `🟢 Tersedia (${occupancy.count}/${occupancy.max})`}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => processCheckIn(guest.id)}
                                  className="bg-stone-900 hover:bg-stone-800 text-white text-[11px] font-medium px-3 py-1.5 rounded-lg"
                                >
                                  Check-In
                                </button>
                              </div>

                              {eventMode === 'mode1' && (
                                <div className="bg-white p-2 rounded-xl border border-stone-200/80 flex flex-col gap-1">
                                  <span className="text-[10px] text-stone-500">Ubah Meja (Baku):</span>
                                  {editingGuestId === guest.id ? (
                                    <div className="flex gap-1">
                                      <select
                                        value={selectedTableDropdown}
                                        onChange={(e) => setSelectedTableDropdown(e.target.value)}
                                        className="text-xs p-1 border border-stone-200 rounded w-full bg-white"
                                      >
                                        <option value="">-- Pilih Meja --</option>
                                        {masterTables.map(tbl => {
                                          const occ = getTableOccupancy(tbl.name);
                                          return (
                                            <option key={tbl.name} value={tbl.name}>
                                              {tbl.name} ({occ.count}/{occ.capacity})
                                            </option>
                                          );
                                        })}
                                      </select>
                                      <button onClick={() => handleSaveDropdownTable(guest.id)} className="bg-stone-900 text-white text-[10px] px-2 rounded">
                                        Simpan
                                      </button>
                                    </div>
                                  ) : (
                                    <button onClick={() => { setEditingGuestId(guest.id); setSelectedTableDropdown(guest.table); }} className="text-[11px] text-stone-600 underline text-left">
                                      Atur Meja Khusus
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {scanResult ? (
                    <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl text-center mb-4">
                      <span className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full ${scanResult.isPendingSync ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                        {scanResult.isPendingSync ? 'Tersimpan Lokal (Menunggu Sinyal Sync)' : 'Check-In Berhasil & Tersinkron Cloud'}
                      </span>
                      <h2 className="text-base font-semibold text-stone-900 mt-2">{scanResult.name}</h2>
                      <div className="mt-2 bg-white p-2.5 rounded-xl border border-stone-200">
                        <p className="text-[10px] text-stone-400">STATUS KEHADIRAN:</p>
                        <p className="text-lg font-bold text-stone-900">
                          {eventMode === 'mode1' ? `Meja: ${scanResult.table}` : 'Tamu Diterima ✓'}
                        </p>
                      </div>
                      <button
                        onClick={() => printReceipt(scanResult)}
                        className="mt-3 w-full bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
                      >
                        <span>🖨️</span> Cetak Struk Meja 58mm
                      </button>
                    </div>
                  ) : (
                    <div className="bg-stone-50 border border-dashed border-stone-300 p-4 rounded-2xl text-center text-stone-400 text-xs mb-4">
                      {isLoading ? 'Menghubungkan ke Cloud Database...' : 'Gunakan kamera atau kolom pencarian di atas.'}
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-stone-50 border border-stone-200/60 p-4 rounded-2xl mb-4">
                  <h3 className="font-semibold text-xs text-stone-700 uppercase tracking-wide mb-3">Log Kehadiran Tamu (Real-Time)</h3>
                  {arrivedCount === 0 ? (
                    <p className="text-xs text-stone-400 text-center py-6">Belum ada tamu hadir.</p>
                  ) : (
                    <div className="divide-y divide-stone-100 max-h-96 overflow-y-auto">
                      {guestList.filter(g => g.status === 'Sudah Hadir').map(g => (
                        <div key={g.id} className="py-2.5 flex justify-between items-center text-xs">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-stone-900">{g.name}</p>
                              {g.isPendingSync && (
                                <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
                                  Antre Sync
                                </span>
                              )}
                            </div>
                            {eventMode === 'mode1' && <p className="text-[11px] text-stone-500">Meja: <span className="text-stone-900">{g.table}</span></p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px]">{g.checkInTime}</span>
                            <button
                              onClick={() => printReceipt(g)}
                              className="text-[10px] bg-stone-900 text-white px-2.5 py-1 rounded-lg hover:bg-stone-800"
                              title="Cetak Struk Thermal"
                            >
                              🖨️ Cetak
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* ================= TAMPILAN ADMIN DASHBOARD ================= */
            <div className="space-y-6">

              <header className="bg-stone-50 border border-stone-200/80 p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h1 className="font-bold text-lg text-stone-900 tracking-tight">
                    {eventMode === 'mode1' ? 'Admin Dashboard — Custom Floor Plan' : 'Admin Dashboard — Standar'}
                  </h1>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Database Cloud Real-Time • E-Ticket URL Slug & Broadcast Email/WA.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {guestList.length === 0 && (
                    <button
                      onClick={handleSeedInitialData}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-2 rounded-xl shadow-sm transition"
                    >
                      + Muat Data Simulasi Awal
                    </button>
                  )}
                  <button
                    onClick={handleResetAllCheckIns}
                    className="bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 text-xs font-medium px-3 py-2 rounded-xl transition"
                  >
                    Reset Kehadiran
                  </button>
                  <div className="flex gap-4 bg-white px-4 py-2 rounded-xl border border-stone-200">
                    <div>
                      <p className="text-[10px] text-stone-400 uppercase font-medium">Total Tamu</p>
                      <p className="text-sm font-bold text-stone-900">{guestList.length}</p>
                    </div>
                    <div className="border-r border-stone-200"></div>
                    <div>
                      <p className="text-[10px] text-stone-400 uppercase font-medium">Hadir</p>
                      <p className="text-sm font-bold text-emerald-600">{arrivedCount}</p>
                    </div>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                <div className="space-y-6">
                  <div className="bg-stone-50 border border-stone-200/80 p-5 rounded-2xl">
                    <h3 className="font-semibold text-xs text-stone-800 uppercase tracking-wide mb-2">Import Master Tamu (CSV)</h3>
                    <p className="text-[11px] text-stone-500 mb-3">Format baris: <code className="bg-white px-1 py-0.5 border rounded">Nama, Kategori, NoHP, Email, Meja</code></p>
                    <input
                      type="file"
                      accept=".csv, .txt"
                      onChange={handleFileUpload}
                      className="w-full text-xs text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-stone-900 file:text-white hover:file:bg-stone-800 cursor-pointer"
                    />
                  </div>

                  <div className="bg-stone-50 border border-stone-200/80 p-5 rounded-2xl">
                    <h3 className="font-semibold text-xs text-stone-800 uppercase tracking-wide mb-3">Tambah Data Tamu Manual</h3>
                    <form onSubmit={handleAddGuest} className="space-y-3">
                      <input
                        type="text"
                        placeholder="Nama Lengkap Tamu"
                        value={newGuest.name}
                        onChange={(e) => setNewGuest({ ...newGuest, name: e.target.value })}
                        className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-xs"
                        required
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="No. WA (0812...)"
                          value={newGuest.phone}
                          onChange={(e) => setNewGuest({ ...newGuest, phone: e.target.value })}
                          className="w-1/2 p-2.5 bg-white border border-stone-200 rounded-xl text-xs"
                        />
                        <select
                          value={newGuest.category}
                          onChange={(e) => setNewGuest({ ...newGuest, category: e.target.value })}
                          className="w-1/2 p-2.5 bg-white border border-stone-200 rounded-xl text-xs"
                        >
                          <option value="Reguler">Reguler</option>
                          <option value="VIP">VIP</option>
                          <option value="Keluarga">Keluarga</option>
                        </select>
                      </div>
                      <input
                        type="email"
                        placeholder="Alamat Email (opsional)"
                        value={newGuest.email}
                        onChange={(e) => setNewGuest({ ...newGuest, email: e.target.value })}
                        className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-xs"
                      />
                      {eventMode === 'mode1' && (
                        <div>
                          <label className="text-[10px] text-stone-500 block mb-1">Alokasi Meja:</label>
                          <select
                            value={newGuest.table}
                            onChange={(e) => setNewGuest({ ...newGuest, table: e.target.value })}
                            className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-xs bg-white"
                          >
                            {masterTables.map(tbl => (
                              <option key={tbl.name} value={tbl.name}>{tbl.name} ({tbl.category})</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <button type="submit" className="w-full bg-stone-900 hover:bg-stone-800 text-white text-xs py-2.5 rounded-xl font-medium transition">
                        Simpan Tamu
                      </button>
                    </form>
                  </div>

                  <div className="bg-stone-50 border border-stone-200/80 p-5 rounded-2xl">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-semibold text-xs text-stone-800 uppercase tracking-wide">Templat Tautan WA</h3>
                      <button
                        onClick={handleSaveWaTemplate}
                        className="text-[10px] bg-stone-900 text-white px-2.5 py-1 rounded-lg hover:bg-stone-800"
                      >
                        Simpan
                      </button>
                    </div>
                    <p className="text-[10px] text-stone-500 mb-2">
                      Variabel: <code className="bg-white px-1 border rounded">{'{nama}'}</code>, <code className="bg-white px-1 border rounded">{'{id}'}</code>, <code className="bg-white px-1 border rounded">{'{link_ticket}'}</code>
                    </p>
                    <textarea
                      rows="5"
                      value={waTemplate}
                      onChange={(e) => setWaTemplate(e.target.value)}
                      className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-[11px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-stone-400"
                    />
                  </div>

                  {eventMode === 'mode1' && (
                    <div className="bg-stone-50 border border-stone-200/80 p-5 rounded-2xl">
                      <h3 className="font-semibold text-xs text-stone-800 uppercase tracking-wide mb-3">Tambah Master Meja / Area</h3>
                      <form onSubmit={handleAddTable} className="space-y-3">
                        <input
                          type="text"
                          placeholder="Nama Meja/Area (Cth: VIP 03)"
                          value={newTable.name}
                          onChange={(e) => setNewTable({ ...newTable, name: e.target.value })}
                          className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-xs"
                          required
                        />
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder="Kapasitas"
                            value={newTable.capacity}
                            onChange={(e) => setNewTable({ ...newTable, capacity: parseInt(e.target.value) || 1 })}
                            className="w-1/2 p-2.5 bg-white border border-stone-200 rounded-xl text-xs"
                            min="1"
                            required
                          />
                          <select
                            value={newTable.category}
                            onChange={(e) => setNewTable({ ...newTable, category: e.target.value })}
                            className="w-1/2 p-2.5 bg-white border border-stone-200 rounded-xl text-xs"
                          >
                            <option value="Reguler">Reguler</option>
                            <option value="VIP">VIP</option>
                            <option value="Keluarga">Keluarga</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-stone-500 block mb-1">Bentuk Visual:</label>
                          <select
                            value={newTable.shape}
                            onChange={(e) => setNewTable({ ...newTable, shape: e.target.value })}
                            className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-xs font-medium"
                          >
                            <option value="kotak">Kotak (Square)</option>
                            <option value="lingkaran">Lingkaran (Round)</option>
                          </select>
                        </div>
                        <button type="submit" className="w-full bg-stone-900 hover:bg-stone-800 text-white text-xs py-2.5 rounded-xl font-medium transition">
                          Tambah ke Denah
                        </button>
                      </form>
                    </div>
                  )}

                </div>

                <div className="lg:col-span-2 space-y-6">

                  {eventMode === 'mode1' ? (
                    <div className="bg-stone-50 border border-stone-200/80 p-5 rounded-2xl">
                      <div className="flex justify-between items-center mb-3">
                        <div>
                          <h3 className="font-semibold text-xs text-stone-800 uppercase tracking-wide">Interactive Floor Plan (Live Cloud)</h3>
                          <p className="text-[11px] text-stone-500">Status kursi di denah otomatis berubah saat Usher memindai tamu di lapangan.</p>
                        </div>
                        <span className="text-[11px] bg-white text-stone-700 font-medium px-2.5 py-1 rounded-lg border border-stone-200">
                          {masterTables.length} Area / Meja
                        </span>
                      </div>

                      <div
                        ref={floorRef}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onTouchMove={handleMouseMove}
                        onTouchEnd={handleMouseUp}
                        className="relative w-full h-[420px] bg-white rounded-xl border border-stone-200 overflow-auto shadow-inner select-none cursor-grab active:cursor-grabbing"
                      >
                        <div className="absolute w-[1200px] h-[800px] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none"></div>

                        {masterTables.map(tbl => {
                          const occupancy = getTableOccupancy(tbl.name);
                          const isRound = tbl.shape === 'lingkaran';

                          return (
                            <div
                              key={tbl.name}
                              onMouseDown={(e) => handleMouseDown(e, tbl.name)}
                              onTouchStart={(e) => handleMouseDown(e, tbl.name)}
                              style={{
                                transform: `translate(${tbl.x || 50}px, ${tbl.y || 50}px)`,
                                position: 'absolute',
                                touchAction: 'none'
                              }}
                              className={`p-3.5 shadow-md border transition-colors flex flex-col justify-between cursor-move ${isRound ? 'rounded-full w-44 h-44 aspect-square' : 'rounded-xl w-56 min-h-[150px]'
                                } ${occupancy.isFull
                                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                                  : 'bg-white border-stone-200 text-stone-800'
                                }`}
                            >
                              <div>
                                <div className="flex justify-between items-start">
                                  <span className="font-semibold text-xs text-stone-900">{tbl.name}</span>
                                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${getCategoryBadge(tbl.category)}`}>
                                    {tbl.category}
                                  </span>
                                </div>
                                <p className={`text-[10px] font-medium mt-0.5 ${occupancy.isFull ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  {occupancy.isFull ? `Penuh (${occupancy.count}/${occupancy.max})` : `${occupancy.count}/${occupancy.max} Terisi`}
                                </p>
                              </div>

                              <div className="bg-stone-50 p-1.5 rounded-lg my-1 overflow-y-auto max-h-14 border border-stone-100">
                                {occupancy.seatedGuests.length === 0 ? (
                                  <p className="text-[9px] text-stone-400 italic text-center">Kosong</p>
                                ) : (
                                  <div className="flex flex-wrap gap-1 justify-center">
                                    {occupancy.seatedGuests.map(sg => (
                                      <span key={sg.id} className="text-[9px] bg-stone-200 text-stone-700 px-1.5 py-0.5 rounded font-medium">
                                        {sg.name.split(' ')[0]}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="flex justify-between items-center pt-1 border-t border-stone-100">
                                <span className="text-[9px] text-stone-400">Geser bebas ✥</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteTable(tbl.name); }}
                                  className="text-[9px] text-rose-600 hover:underline"
                                >
                                  Hapus
                                </button>
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-stone-50 border border-stone-200/80 p-5 rounded-2xl">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-semibold text-xs text-stone-800 uppercase tracking-wide">Monitoring Standar (Live Cloud)</h3>
                          <p className="text-[11px] text-stone-500">Pemantauan daftar tamu berbaris rapi berdasarkan status konfirmasi kehadiran.</p>
                        </div>
                        <span className="text-[11px] bg-emerald-50 text-emerald-800 font-semibold px-2.5 py-1 rounded-lg border border-emerald-200">
                          {arrivedCount} dari {guestList.length} Tamu Hadir
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="bg-stone-50 border border-stone-200/80 p-5 rounded-2xl">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                      <h3 className="font-semibold text-xs text-stone-800 uppercase tracking-wide">
                        Database Master Tamu ({filteredAdminGuests.length})
                      </h3>
                      <input
                        type="text"
                        placeholder="Filter nama / ID / HP..."
                        value={adminSearch}
                        onChange={(e) => setAdminSearch(e.target.value)}
                        className="text-xs bg-white border border-stone-200 px-3 py-1.5 rounded-xl w-full sm:w-64 focus:outline-none focus:ring-1 focus:ring-stone-400"
                      />
                    </div>

                    <div className="max-h-96 overflow-y-auto border border-stone-200 rounded-xl bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-stone-100 text-stone-500 uppercase font-semibold border-b border-stone-200 sticky top-0">
                          <tr>
                            <th className="p-3">ID / Kontak</th>
                            <th className="p-3">Nama Tamu</th>
                            <th className="p-3">Kategori</th>
                            {eventMode === 'mode1' && <th className="p-3">Meja</th>}
                            <th className="p-3">Status</th>
                            <th className="p-3 text-center">Undangan (QR / WA / Email)</th>
                            <th className="p-3 text-center">Aksi (Cetak / Hapus)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {filteredAdminGuests.map(g => (
                            <tr key={g.id} className="hover:bg-stone-50/50">
                              <td className="p-3 font-mono text-[11px] text-stone-500">
                                <p className="font-bold">{g.id}</p>
                                <p className="text-[10px]">WA: {g.phone}</p>
                                <p className="text-[10px]">Email: {g.email || '-'}</p>
                              </td>
                              <td className="p-3 font-medium text-stone-900">{g.name}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getCategoryBadge(g.category)}`}>
                                  {g.category}
                                </span>
                              </td>
                              {eventMode === 'mode1' && <td className="p-3 font-medium text-stone-900">{g.table}</td>}
                              <td className="p-3">
                                <span className={`font-medium ${g.status === 'Sudah Hadir' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {g.status} {g.status === 'Sudah Hadir' && `(${g.checkInTime})`}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => setSelectedQrGuest(g)}
                                    className="bg-stone-900 hover:bg-stone-700 text-white text-[10px] font-medium px-2 py-1 rounded transition"
                                    title="Lihat & Download Kartu QR"
                                  >
                                    QR
                                  </button>
                                  <button
                                    onClick={() => handleSendWhatsApp(g)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium px-2 py-1 rounded transition"
                                    title="Kirim Link E-Ticket via WhatsApp"
                                  >
                                    WA
                                  </button>
                                  <button
                                    onClick={() => handleSendEmail(g)}
                                    className="bg-stone-700 hover:bg-stone-600 text-white text-[10px] font-medium px-2 py-1 rounded transition"
                                    title="Kirim E-Ticket via Email"
                                  >
                                    Email
                                  </button>
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => printReceipt(g)}
                                    className="bg-stone-100 hover:bg-stone-200 text-stone-700 text-[10px] font-medium px-2.5 py-1 rounded transition"
                                    title="Cetak Struk Thermal"
                                  >
                                    🖨️ Cetak
                                  </button>
                                  <button onClick={() => handleDeleteGuest(g.id)} className="text-rose-600 hover:text-rose-800 text-[11px] font-medium px-1">
                                    Hapus
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>

              </div>
            </div>
          )}
        </div>

      </div>

      {/* Modal Preview QR Card */}
      {selectedQrGuest && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-stone-200 text-center relative">
            <button
              onClick={() => setSelectedQrGuest(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-800 text-sm font-bold w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center"
            >
              ✕
            </button>

            <span className="text-[10px] font-bold tracking-wider uppercase text-stone-400">Kartu Akses Tamu</span>
            <h2 className="text-lg font-bold text-stone-900 mt-1">{selectedQrGuest.name}</h2>
            <p className="text-xs text-stone-500 mb-4">
              {selectedQrGuest.category} {eventMode === 'mode1' && `• ${selectedQrGuest.table}`}
            </p>

            <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200 inline-flex flex-col items-center justify-center mb-4">
              <QRCodeCanvas
                id="qr-gen-canvas"
                value={selectedQrGuest.id}
                size={200}
                level="H"
                includeMargin={true}
              />
              <span className="font-mono text-xs font-bold text-stone-700 mt-2">{selectedQrGuest.id}</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleDownloadQrCard(selectedQrGuest)}
                className="flex-1 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold py-3 rounded-xl transition"
              >
                ⬇ Download PNG
              </button>
              <button
                onClick={() => handleSendWhatsApp(selectedQrGuest)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-3 rounded-xl transition"
              >
                Kirim WA
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}