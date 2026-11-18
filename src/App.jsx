import React, { useState, useEffect } from "react";
import { db } from "./firebase"; // Sesuaikan jalur import firebase Anda
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot
} from "firebase/firestore";
import { Html5QrcodeScanner } from "html5-qrcode";

// --- UTILITY PRINTER THERMAL 58mm ---
const printGuestReceipt = (guest, eventInfo = { name: "Digital Guestbook" }) => {
  const dateStr = new Date().toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

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

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, usher, floorplan
  const [guests, setGuests] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State Tambah Tamu
  const [form, setForm] = useState({ name: "", phone: "", email: "", category: "General", pax: 1, tableId: "" });
  const [editingId, setEditingId] = useState(null);

  // Scanner State
  const [scanResult, setScanResult] = useState(null);

  // Real-time listener dari Firestore
  useEffect(() => {
    const unsubGuests = onSnapshot(collection(db, "guests"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGuests(data);
      setLoading(false);
    });

    const unsubTables = onSnapshot(collection(db, "tables"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTables(data);
    });

    return () => {
      unsubGuests();
      unsubTables();
    };
  }, []);

  // Handler Simpan / Edit Tamu
  const handleSaveGuest = async (e) => {
    e.preventDefault();
    if (!form.name) return alert("Nama tamu wajib diisi!");

    // Cari nama meja jika tableId dipilih
    const selectedTable = tables.find(t => t.id === form.tableId);
    const guestData = {
      ...form,
      tableName: selectedTable ? selectedTable.name : "Belum diatur",
      checkedIn: form.checkedIn || false,
    };

    if (editingId) {
      await updateDoc(doc(db, "guests", editingId), guestData);
      setEditingId(null);
    } else {
      await addDoc(collection(db, "guests"), { ...guestData, checkedIn: false });
    }

    setForm({ name: "", phone: "", email: "", category: "General", pax: 1, tableId: "" });
  };

  const handleEdit = (guest) => {
    setForm(guest);
    setEditingId(guest.id);
  };

  const handleDelete = async (id) => {
    if (confirm("Hapus tamu ini dari daftar?")) {
      await deleteDoc(doc(db, "guests", id));
    }
  };

  // Kirim WhatsApp Otomatis
  const sendWhatsApp = (guest) => {
    const message = `Halo ${guest.name}, berikut adalah tautan undangan digital dan QR Code Anda: ${window.location.origin}/?ticket=${guest.id}`;
    window.open(`https://wa.me/${guest.phone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  // Kirim Email (via mailto)
  const sendEmail = (guest) => {
    const subject = "Undangan Resepsi Pernikahan";
    const body = `Halo ${guest.name},\n\nBerikut adalah tautan e-ticket Anda: ${window.location.origin}/?ticket=${guest.id}\n\nTunjukkan QR Code saat registrasi.`;
    window.location.href = `mailto:${guest.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // QR Scanner Inisialisasi untuk Usher App
  useEffect(() => {
    if (activeTab === "usher") {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);

      scanner.render(
        async (decodedText) => {
          // Asumsi QR berisi ID tamu atau URL dengan parameter ticket
          let guestId = decodedText;
          if (decodedText.includes("?ticket=")) {
            guestId = decodedText.split("?ticket=")[1];
          }

          const found = guests.find(g => g.id === guestId);
          if (found) {
            // Update status check-in ke firestore
            await updateDoc(doc(db, "guests", found.id), { checkedIn: true });
            setScanResult(found);
            scanner.clear();
          } else {
            alert("Tamu tidak ditemukan dalam database!");
          }
        },
        (error) => {
          // console.warn(error);
        }
      );

      return () => {
        scanner.clear().catch(err => console.error("Gagal membersihkan scanner", err));
      };
    }
  }, [activeTab, guests]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      {/* HEADER NAVBAR */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap justify-between items-center gap-4">
          <h1 className="text-xl font-bold text-indigo-600 flex items-center gap-2">
            🎟️ Digital Guestbook & Table Mgmt
          </h1>
          <nav className="flex gap-2">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === "dashboard" ? "bg-indigo-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}
            >
              📊 Master Tamu
            </button>
            <button
              onClick={() => setActiveTab("floorplan")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === "floorplan" ? "bg-indigo-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}
            >
              🪑 Denah Meja
            </button>
            <button
              onClick={() => setActiveTab("usher")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === "usher" ? "bg-indigo-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}
            >
              📷 Usher Scanner
            </button>
          </nav>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        {loading ? (
          <div className="text-center py-20 text-gray-500">Memuat data dari server...</div>
        ) : (
          <>
            {/* TAB 1: MASTER TAMU & DASHBOARD */}
            {activeTab === "dashboard" && (
              <div className="space-y-6">
                {/* Form Input Tamu */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border">
                  <h2 className="text-lg font-bold mb-4">{editingId ? "Edit Data Tamu" : "Tambah Tamu Baru"}</h2>
                  <form onSubmit={handleSaveGuest} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <input
                      type="text"
                      placeholder="Nama Lengkap *"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className="border p-2.5 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      required
                    />
                    <input
                      type="text"
                      placeholder="No. WhatsApp (cth: 62812...)"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                      className="border p-2.5 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <input
                      type="email"
                      placeholder="Alamat Email"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className="border p-2.5 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <select
                      value={form.category}
                      onChange={e => setForm({ ...form, category: e.target.value })}
                      className="border p-2.5 rounded-xl bg-white"
                    >
                      <option value="General">General</option>
                      <option value="VIP">VIP</option>
                      <option value="VVIP">VVIP</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      placeholder="Jumlah Pax"
                      value={form.pax}
                      onChange={e => setForm({ ...form, pax: parseInt(e.target.value) || 1 })}
                      className="border p-2.5 rounded-xl"
                    />
                    <select
                      value={form.tableId}
                      onChange={e => setForm({ ...form, tableId: e.target.value })}
                      className="border p-2.5 rounded-xl bg-white"
                    >
                      <option value="">-- Pilih Meja --</option>
                      {tables.map(t => (
                        <option key={t.id} value={t.id}>{t.name} (Kapasitas: {t.capacity})</option>
                      ))}
                    </select>
                    <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
                      <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-medium transition shadow">
                        {editingId ? "Perbarui Tamu" : "Simpan Tamu"}
                      </button>
                      {editingId && (
                        <button type="button" onClick={() => { setEditingId(null); setForm({ name: "", phone: "", email: "", category: "General", pax: 1, tableId: "" }); }} className="bg-gray-200 hover:bg-gray-300 px-4 py-2.5 rounded-xl">
                          Batal
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                {/* Tabel Daftar Tamu */}
                <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                  <div className="p-4 border-b font-bold text-gray-700">Daftar Tamu Undangan ({guests.length})</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b text-sm text-gray-600">
                          <th className="p-3">Nama</th>
                          <th className="p-3">Kategori</th>
                          <th className="p-3">Pax</th>
                          <th className="p-3">Meja</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-sm">
                        {guests.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="text-center py-8 text-gray-400">Belum ada data tamu.</td>
                          </tr>
                        ) : (
                          guests.map(g => (
                            <tr key={g.id} className="hover:bg-gray-50">
                              <td className="p-3 font-medium">{g.name}<div className="text-xs text-gray-400">{g.phone}</div></td>
                              <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-semibold ${g.category === 'VIP' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>{g.category}</span></td>
                              <td className="p-3">{g.pax}</td>
                              <td className="p-3">{g.tableName || '-'}</td>
                              <td className="p-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${g.checkedIn ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                  {g.checkedIn ? "Hadir" : "Belum Hadir"}
                                </span>
                              </td>
                              <td className="p-3 flex items-center justify-center gap-2">
                                <button onClick={() => sendWhatsApp(g)} className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg" title="Kirim WA">💬</button>
                                <button onClick={() => sendEmail(g)} className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg" title="Kirim Email">✉️</button>
                                <button onClick={() => printGuestReceipt(g)} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg" title="Cetak Struk Thermal 58mm">🖨️</button>
                                <button onClick={() => handleEdit(g)} className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg" title="Edit">✏️</button>
                                <button onClick={() => handleDelete(g.id)} className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg" title="Hapus">🗑️</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: DENAH MEJA */}
            {activeTab === "floorplan" && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border text-center">
                <h2 className="text-lg font-bold mb-2">Denah Meja Interaktif</h2>
                <p className="text-gray-500 mb-6">Kelola tata letak kursi dan kapasitas ruangan di sini.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tables.map(t => (
                    <div key={t.id} className="border p-4 rounded-xl shadow-sm bg-gray-50 text-left">
                      <h3 className="font-bold text-indigo-600">{t.name}</h3>
                      <p className="text-sm text-gray-500">Kapasitas: {t.capacity} Kursi</p>
                    </div>
                  ))}
                  {tables.length === 0 && <p className="text-gray-400 col-span-full">Belum ada meja yang terdaftar di database.</p>}
                </div>
              </div>
            )}

            {/* TAB 3: USHER SCANNER */}
            {activeTab === "usher" && (
              <div className="max-w-md mx-auto bg-white p-6 rounded-2xl shadow-sm border text-center">
                <h2 className="text-lg font-bold mb-4">Scanner Check-in Tamu</h2>
                {!scanResult ? (
                  <div id="reader" className="overflow-hidden rounded-xl border mb-4"></div>
                ) : (
                  <div className="bg-green-50 border border-green-200 p-6 rounded-2xl text-center space-y-3">
                    <div className="text-4xl">✅</div>
                    <h3 className="text-lg font-bold text-green-800">Check-In Berhasil!</h3>
                    <p className="text-gray-700 font-medium text-lg">{scanResult.name}</p>
                    <p className="text-sm text-gray-500">Meja: {scanResult.tableName || 'Reguler'} | {scanResult.pax} Pax</p>
                    <div className="pt-2 flex flex-col gap-2">
                      <button
                        onClick={() => printGuestReceipt(scanResult)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-medium shadow"
                      >
                        🖨️ Cetak Struk Meja
                      </button>
                      <button
                        onClick={() => setScanResult(null)}
                        className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 py-2.5 rounded-xl font-medium"
                      >
                        Scan Tamu Lainnya
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}