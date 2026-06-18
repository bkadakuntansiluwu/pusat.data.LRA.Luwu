const SCRIPT_URL_DATABASE = "https://script.google.com/macros/s/AKfycbxQCrPfY8PfrCs442HOaQxyob_c0s2lZW2st4aikFKtWi6znX0QR1ZyCD3kAU_jFTpaPA/exec";
const SECRET_KEY = "LUWU_AMAN_2026_X99";
let globalRawData = [];
let kodeSkpdAktif = ""; 
let modalAsisten;
let modalKeterangan;

// === STATE TTD CLOUD SYNC ===
let ttdSyncTimer = null;        // debounce timer untuk auto-save TTD
let ttdCloudLoaded = false;     // flag: apakah TTD sudah di-fetch dari cloud untuk SKPD saat ini
let ttdSyncInProgress = false;  // flag: mencegah loop infinite saat populate TTD dari cloud

document.addEventListener("DOMContentLoaded", function() {
    modalAsisten = new bootstrap.Modal(document.getElementById('modalPenjelasan'));
    modalKeterangan = new bootstrap.Modal(document.getElementById('modalKeterangan'));
    
    isiDropdownTahunOtomatis();
    
    // === SENSOR IDENTITAS PENGGUNA UNTUK AUDIT LOG ===
    // Sekali input, tersimpan di localStorage. Dipakai untuk audit log & TTD sync.
    cekIdentitasPengguna();
    
    // === SENSOR AUTO-SAVE TANDA TANGAN (LOCAL + CLOUD SYNC) ===
    // Strategi cerdas:
    //   1. Saat user ketik → simpan ke localStorage (instant)
    //   2. Debounce 2 detik → sync ke cloud (cross-device)
    //   3. Saat SKPD ganti → fetch dari cloud dulu, fallback ke localStorage
    document.getElementById('ttd-jabatan').addEventListener('input', function() { 
        if(kodeSkpdAktif) {
            localStorage.setItem('TTD_JAB_' + kodeSkpdAktif, this.innerText); 
            jadwalSyncTTDKeCloud();
        }
    });
    document.getElementById('ttd-nama').addEventListener('input', function() { 
        if(kodeSkpdAktif) {
            localStorage.setItem('TTD_NAMA_' + kodeSkpdAktif, this.innerText); 
            jadwalSyncTTDKeCloud();
        }
    });
    document.getElementById('ttd-nip').addEventListener('input', function() { 
        if(kodeSkpdAktif) {
            localStorage.setItem('TTD_NIP_' + kodeSkpdAktif, this.innerText); 
            jadwalSyncTTDKeCloud();
        }
    });
});

// =========================================================================
// FUNGSI: CEK IDENTITAS PENGGUNA (untuk audit log)
// Tampilkan prompt sekali saja, simpan nama ke localStorage
// =========================================================================
function cekIdentitasPengguna() {
    let namaTersimpan = localStorage.getItem('LRA_USER_NAME');
    
    if (!namaTersimpan) {
        // Tampilkan prompt identitas ( Swal.fire dengan input )
        setTimeout(() => {
            Swal.fire({
                title: 'Selamat Datang 👋',
                html: `
                    <div style="text-align: left; font-size: 13px; line-height: 1.6;">
                        Masukkan Nama Bapak/Ibu<br>                       
                    </div>
                `,
                input: 'text',
                inputPlaceholder: 'Ketik Nama Bapak/Ibu ...',
                inputAttributes: { maxlength: 80 },
                inputValidator: (value) => {
                    if (!value || value.trim().length < 3) return 'Nama terlalu pendek (min 3 huruf)';
                },
                showCancelButton: false,
                confirmButtonText: 'Simpan & Lanjut',
                confirmButtonColor: '#0f172a',
                allowOutsideClick: false,
                allowEscapeKey: false
            }).then((result) => {
                if (result.isConfirmed) {
                    let nama = result.value.trim();
                    localStorage.setItem('LRA_USER_NAME', nama);
                    Swal.fire({
                        title: 'Tersimpan!',
                        html: `Halo <b>${nama}</b> 👋<br><br><small class="text-muted">Nama ini akan otomatis tercatat saat Anda menyimpan data.</small>`,
                        icon: 'success',
                        confirmButtonColor: '#10b981',
                        timer: 3000
                    });
                }
            });
        }, 800);
    }
}

// =========================================================================
// FUNGSI: DAPATKAN IDENTITAS PENGGUNA (untuk audit log + TTD sync)
// =========================================================================
function getIdentitasPengguna() {
    return localStorage.getItem('LRA_USER_NAME') || 'unknown';
}

// =========================================================================
// FUNGSI: DAPATKAN USER AGENT LENGKAP (nama + browser info)
// =========================================================================
function getUserAgentLengkap() {
    let nama = getIdentitasPengguna();
    let browser = navigator.userAgent.substring(0, 100);
    return `${nama} | ${browser}`;
}

// =========================================================================
// FUNGSI: JADWAL SYNC TTD KE CLOUD (DEBOUNCED 2 DETIK)
// Cegah spam request: user ketik 10x dalam 2 detik → cuma kirim 1x di akhir
// =========================================================================
function jadwalSyncTTDKeCloud() {
    // Tampilkan badge "Mengetik..." saat user aktif mengetik
    perbaruiBadgeTTD('unsaved');
    
    // Kalau ada timer pending, batalkan
    if (ttdSyncTimer) clearTimeout(ttdSyncTimer);
    
    // Set timer baru 2 detik
    ttdSyncTimer = setTimeout(() => {
        syncTTDKeCloud();
    }, 2000);
}

// =========================================================================
// FUNGSI: SYNC TTD KE CLOUD (kirim ke server)
// =========================================================================
function syncTTDKeCloud() {
    if (!kodeSkpdAktif) return;
    if (ttdSyncInProgress) return; // cegah loop
    
    let tahun = document.getElementById('selectTahun').value;
    let jabatan = document.getElementById('ttd-jabatan').innerText.trim();
    let nama = document.getElementById('ttd-nama').innerText.trim();
    let nip = document.getElementById('ttd-nip').innerText.trim();
    
    // Skip kalau semua kosong (jangan kirim data kosong ke server)
    if (!jabatan && !nama && !nip) return;
    
    let payload = {
        secret_key: SECRET_KEY,
        action: 'save_ttd',
        tahun: tahun,
        kode_skpd: kodeSkpdAktif,
        jabatan: jabatan,
        nama: nama,
        nip: nip,
        updated_by: getIdentitasPengguna(),
        user_agent: getUserAgentLengkap()
    };
    
    // Silent sync (tidak munculkan popup agar tidak mengganggu user)
    fetch(SCRIPT_URL_DATABASE, {
        method: "POST",
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
        if (res.status === 'success') {
            // Silent success — ttd sudah tersimpan di cloud
            perbaruiBadgeTTD('synced', new Date().toISOString());
            console.log('✓ TTD synced to cloud for SKPD:', kodeSkpdAktif);
        } else if (res.status === 'busy') {
            // Server sibuk → retry 5 detik lagi (silent)
            perbaruiBadgeTTD('local_only');
            setTimeout(() => syncTTDKeCloud(), 5000);
        } else {
            console.warn('TTD sync warning:', res.message);
            perbaruiBadgeTTD('local_only');
        }
    })
    .catch(err => {
        // Silent fail — TTD tetap tersimpan di localStorage, akan di-retry saat user save data utama
        perbaruiBadgeTTD('offline');
        console.warn('TTD sync gagal (offline?):', err.message);
    });
}

// =========================================================================
// FUNGSI: LOAD TTD DARI CLOUD (saat SKPD terdeteksi)
// Strategi cerdas:
//   1. Fetch dari cloud
//   2. Kalau ada → populate fields + update localStorage (override local)
//   3. Kalau tidak ada → cek localStorage, kalau ada → push ke cloud
//   4. Kalau keduanya kosong → biarkan kosong (user isi manual)
// =========================================================================
function muatTTDDariCloud() {
    if (!kodeSkpdAktif) return;
    
    // === TAMPILKAN INDICATOR LOADING ===
    perbaruiBadgeTTD('loading');
    
    let tahun = document.getElementById('selectTahun').value;
    let url = `${SCRIPT_URL_DATABASE}?action=load_ttd&tahun=${tahun}&kode_skpd=${kodeSkpdAktif}&secret_key=${SECRET_KEY}`;
    
    fetch(url)
    .then(r => r.json())
    .then(res => {
        ttdSyncInProgress = true; // cegah event 'input' trigger sync balik
        
        if (res.status === 'success' && res.data) {
            // Cloud punya data → populate fields
            let data = res.data;
            
            if (data.jabatan) document.getElementById('ttd-jabatan').innerText = data.jabatan;
            if (data.nama) document.getElementById('ttd-nama').innerText = data.nama;
            if (data.nip) document.getElementById('ttd-nip').innerText = data.nip;
            
            // Update localStorage juga (supaya next time cepat)
            localStorage.setItem('TTD_JAB_' + kodeSkpdAktif, data.jabatan || '');
            localStorage.setItem('TTD_NAMA_' + kodeSkpdAktif, data.nama || '');
            localStorage.setItem('TTD_NIP_' + kodeSkpdAktif, data.nip || '');
            
            ttdCloudLoaded = true;
            perbaruiBadgeTTD('synced', data.updated_at);
            console.log('✓ TTD dimuat dari cloud untuk SKPD:', kodeSkpdAktif);
        } else {
            // Cloud tidak punya data → cek localStorage
            let localJab = localStorage.getItem('TTD_JAB_' + kodeSkpdAktif);
            let localNma = localStorage.getItem('TTD_NAMA_' + kodeSkpdAktif);
            let localNip = localStorage.getItem('TTD_NIP_' + kodeSkpdAktif);
            
            if (localJab || localNma || localNip) {
                // LocalStorage ada → populate + push ke cloud (backup)
                if (localJab) document.getElementById('ttd-jabatan').innerText = localJab;
                if (localNma) document.getElementById('ttd-nama').innerText = localNma;
                if (localNip) document.getElementById('ttd-nip').innerText = localNip;
                
                // Push ke cloud (silent)
                setTimeout(() => syncTTDKeCloud(), 500);
                perbaruiBadgeTTD('local_only');
                console.log('✓ TTD dari localStorage, sync ke cloud untuk SKPD:', kodeSkpdAktif);
            } else {
                // Keduanya kosong → user belum pernah isi
                perbaruiBadgeTTD('empty');
            }
        }
        
        setTimeout(() => { ttdSyncInProgress = false; }, 500);
    })
    .catch(err => {
        // Cloud gagal → fallback ke localStorage saja
        let localJab = localStorage.getItem('TTD_JAB_' + kodeSkpdAktif);
        let localNma = localStorage.getItem('TTD_NAMA_' + kodeSkpdAktif);
        let localNip = localStorage.getItem('TTD_NIP_' + kodeSkpdAktif);
        
        if (localJab) document.getElementById('ttd-jabatan').innerText = localJab;
        if (localNma) document.getElementById('ttd-nama').innerText = localNma;
        if (localNip) document.getElementById('ttd-nip').innerText = localNip;
        
        ttdSyncInProgress = false;
        perbaruiBadgeTTD('offline');
        console.warn('TTD cloud load gagal, fallback ke localStorage:', err.message);
    });
}

// =========================================================================
// FUNGSI: PERBARUI BADGE STATUS TTD (di sebelah kolom TTD)
// Status: loading | synced | local_only | empty | offline | unsaved
// =========================================================================
function perbaruiBadgeTTD(status, updatedAt) {
    let badge = document.getElementById('ttdStatusBadge');
    if (!badge) return; // badge belum ada di HTML (kompatibilitas mundur)
    
    let config = {
        loading:    { class: 'bg-secondary',   text: '⏳ Memuat...',          title: 'Sedang ambil data dari cloud' },
        synced:     { class: 'bg-success',     text: '☁ Tersimpan Cloud',     title: updatedAt ? `Tersinkron: ${new Date(updatedAt).toLocaleString('id-ID')}` : 'Tersinkron dengan cloud' },
        local_only: { class: 'bg-warning',     text: '💾 Local Only',         title: 'Hanya tersimpan di browser, belum sync ke cloud' },
        empty:      { class: 'bg-light',       text: '✏ Belum diisi',         title: 'Ketik TTD untuk menyimpan' },
        offline:    { class: 'bg-danger',      text: ' Offline',             title: 'Gagal koneksi cloud, pakai localStorage' },
        unsaved:    { class: 'bg-info',        text: ' Mengetik...',          title: 'Akan otomatis sync 2 detik setelah berhenti ketik' }
    };
    
    let cfg = config[status] || config.empty;
    badge.className = `badge ${cfg.class} text-dark`;
    badge.innerText = cfg.text;
    badge.title = cfg.title;
}

// =========================================================================
// FUNGSI: HAPUS TTD DARI CLOUD (reset kalau salah ketik)
// =========================================================================
function hapusTTDDariCloud() {
    if (!kodeSkpdAktif) {
        Swal.fire('Info', 'Upload Excel SIPD dulu untuk deteksi SKPD.', 'info');
        return;
    }
    
    Swal.fire({
        title: 'Hapus Tanda Tangan?',
        html: `
            <div style="text-align: left; font-size: 13px; line-height: 1.6;">
                TTD untuk <b>SKPD ${kodeSkpdAktif}</b> akan dihapus dari <b>database cloud</b>.<br>
                <small class="text-muted">Tindakan ini dicatat di Audit Log. SKPD lain yang buka aplikasi tidak akan melihat TTD ini lagi.</small>
            </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (!result.isConfirmed) return;
        
        Swal.fire({ title: 'Menghapus...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        let payload = {
            secret_key: SECRET_KEY,
            action: 'delete_ttd',
            tahun: document.getElementById('selectTahun').value,
            kode_skpd: kodeSkpdAktif,
            updated_by: getIdentitasPengguna()
        };
        
        fetch(SCRIPT_URL_DATABASE, {
            method: "POST",
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success' || res.status === 'not_found') {
                // Kosongkan field TTD
                ttdSyncInProgress = true;
                document.getElementById('ttd-jabatan').innerText = 'KEPALA SKPD';
                document.getElementById('ttd-nama').innerText = 'NAMA KEPALA SKPD';
                document.getElementById('ttd-nip').innerText = 'NIP. 19700101 200001 1 001';
                
                // Hapus dari localStorage juga
                localStorage.removeItem('TTD_JAB_' + kodeSkpdAktif);
                localStorage.removeItem('TTD_NAMA_' + kodeSkpdAktif);
                localStorage.removeItem('TTD_NIP_' + kodeSkpdAktif);
                
                perbaruiBadgeTTD('empty');
                setTimeout(() => { ttdSyncInProgress = false; }, 500);
                
                Swal.fire('Berhasil!', 'TTD telah dihapus dari database cloud.', 'success');
            } else {
                Swal.fire('Gagal', res.message || 'Terjadi kesalahan.', 'error');
            }
        })
        .catch(err => Swal.fire('Error', 'Gagal koneksi: ' + err.message, 'error'));
    });
}

// ENGINE DROPDOWN TAHUN DINAMIS
function isiDropdownTahunOtomatis() {
    let select = document.getElementById('selectTahun');
    let tahunSekarang = new Date().getFullYear(); 
    let tahunMulai = 2026; 
    let tahunSelesai = tahunSekarang + 0; 

    select.innerHTML = ''; 
    for (let t = tahunMulai; t <= tahunSelesai; t++) {
        let opt = document.createElement('option');
        opt.value = t;
        opt.innerText = t;
        if (t === tahunSekarang) opt.selected = true;
        select.appendChild(opt);
    }
}

// SENSOR KALENDER TANDA TANGAN + AUTO-LOAD TTD DARI CLOUD
function updateInfoTandaTangan() {
    let tahun = document.getElementById('selectTahun').value;
    let periodeStr = document.getElementById('selectPeriode').value;
    let tglElement = document.getElementById('ttd-tanggal');
    
    if (periodeStr.includes("Juni")) {
        tglElement.innerText = "Belopa, 30 Juni " + tahun;
    } else {
        tglElement.innerText = "Belopa, 31 Desember " + tahun;
    }

    if(!kodeSkpdAktif) return;
    
    // === CERDAS: Saat SKPD aktif berubah atau tahun berubah, fetch TTD dari cloud ===
    // Strategi: cloud first, fallback localStorage (dilakukan di muatTTDDariCloud)
    muatTTDDariCloud();
}

// ========================================================
// MESIN PEMBACA ANGKA CERDAS (ANTI ERROR & PAHAM MINUS)
// ========================================================
function parseIndonesianNumber(val) {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    
    let str = String(val).trim();
    if (str === '-' || str === '') return 0;

    let isNegative = false;
    // Cerdas membaca angka minus dalam kurung akuntansi: ( 1.500.000 )
    if (str.startsWith('(') && str.endsWith(')')) {
        isNegative = true;
        str = str.substring(1, str.length - 1).trim();
    } else if (str.startsWith('-')) {
        isNegative = true;
        str = str.substring(1).trim();
    }

    // Buang spasi, lambang %, atau Rp yang mengganggu
    str = str.replace(/\s/g, '').replace(/%/g, '').replace(/Rp/gi, '');

    // Logika pengubah Titik & Koma ke format Komputer
    if (str.includes('.') && str.includes(',')) {
        str = str.replace(/\./g, '').replace(/,/g, '.'); // 1.500.000,00 -> 1500000.00
    } else if (str.includes(',') && !str.includes('.')) {
        let parts = str.split(',');
        if (parts[parts.length - 1].length <= 2) {
            str = str.replace(/,/g, '.'); // Jika koma adalah desimal
        } else {
            str = str.replace(/,/g, ''); // Jika koma adalah ribuan
        }
    } else if (str.includes('.') && !str.includes(',')) {
        let parts = str.split('.');
        if (parts[parts.length - 1].length === 2 && parts.length === 2) {
            // Biarkan (Kemungkinan salah ketik titik jadi desimal)
        } else {
            str = str.replace(/\./g, ''); // Hapus titik ribuan
        }
    }

    let num = parseFloat(str);
    if (isNaN(num)) return 0;
    return isNegative ? -num : num;
}

document.getElementById('excelFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        globalRawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1});
        processAndBuildLRA();
    };
    reader.readAsArrayBuffer(file);
});

function applyFilters() {
    let tahun = document.getElementById('selectTahun').value;
    document.getElementById('headerTahun').innerText = "TAHUN ANGGARAN " + tahun;
    updateInfoTandaTangan(); 
    if(globalRawData.length > 0) processAndBuildLRA();
}

function processAndBuildLRA() {
    const tbody = document.getElementById('containerRender');
    tbody.innerHTML = '';
    
    let urusanDitemukan = false;
    kodeSkpdAktif = ""; 
    let trackerKode = "";

    // =========================================================================
    // 1. SENSOR RADAR KOLOM AI: Pelacak "Anggaran", "Realisasi", "Operasi", "Modal", "BTT", "Transfer"
    // =========================================================================
    let colAnggaran = [];
    let colRealisasi = [];
    let colOperasi = []; 
    let colModal = [];   
    let colBtt = [];      // Memori Kolom BTT
    let colTransfer = []; // Memori Kolom Transfer
    let maxAnggaranCount = 0;

    for (let r = 0; r < 15 && r < globalRawData.length; r++) {
        let rowObj = globalRawData[r];
        if (!rowObj) continue;
        
        let tempAng = []; let tempRea = [];
        
        for (let c = 4; c < rowObj.length; c++) {
            let cellVal = String(rowObj[c] || '').toLowerCase().trim();
            
            // Tangkap Koordinat Anggaran & Realisasi
            if (cellVal === 'anggaran') tempAng.push(c);
            else if (cellVal === 'realisasi') tempRea.push(c);
            
            // Tangkap Koordinat Header "Operasi", "Modal", "BTT", "Transfer"
            if (cellVal === 'operasi') { colOperasi.push(c); colOperasi.push(c + 1); } 
            else if (cellVal === 'modal') { colModal.push(c); colModal.push(c + 1); }
            else if (cellVal.includes('tak terduga')) { colBtt.push(c); colBtt.push(c + 1); }
            else if (cellVal.includes('transfer')) { colTransfer.push(c); colTransfer.push(c + 1); }
        }
        
        if (tempAng.length > maxAnggaranCount) {
            maxAnggaranCount = tempAng.length;
            colAnggaran = tempAng; colRealisasi = tempRea;
        }
    }

    // Fallback Jaring Pengaman (Kalau format Excel hancur)
    if (colAnggaran.length === 0) colAnggaran = [5, 7, 9, 11];
    if (colRealisasi.length === 0) colRealisasi = [6, 8, 10, 12];
    if (colOperasi.length === 0) colOperasi = [5, 6]; 
    if (colModal.length === 0) colModal = [7, 8];     
    // =========================================================================

    for (let i = 0; i < globalRawData.length; i++) {
        let row = globalRawData[i];
        if (!row || row.length === 0) continue;

        let col1 = row[0] ? String(row[0]).trim() : ''; let col2 = row[1] ? String(row[1]).trim() : ''; 
        let col3 = row[2] ? String(row[2]).trim() : ''; let col4 = row[3] ? String(row[3]).trim() : ''; 
        let uraian = row[4] ? String(row[4]).trim() : '';

        let textCol1 = col1.toLowerCase(); let textCol2 = col2.toLowerCase(); let textUraian = uraian.toLowerCase();

        if (textCol1 === '1' && (textCol2 === '2' || textUraian === '2' || textUraian === '3')) continue;
        if (textCol1.includes('kab. luwu') || textUraian.includes('kab. luwu')) continue;
        if (textCol1.includes('rekapitulasi') || textUraian.includes('rekapitulasi')) continue;
        if (textCol1.includes('beserta hasil') || textUraian.includes('beserta hasil')) continue;
        if (textCol1.includes('tahun anggaran') || textUraian.includes('tahun anggaran')) continue;

        let fullKode = col1 + col2 + col3 + col4;
        if (!fullKode && !uraian) continue; 

        let segmen = [];
        if (col1) segmen.push(col1); if (col2) segmen.push(col2);
        if (col3) segmen.push(col3); if (col4) segmen.push(col4);
        let kodeRekening = segmen.join('.');
        
        if (kodeRekening) trackerKode = kodeRekening;

        // =========================================================================
        // 2. PERHITUNGAN SUPER AKURAT (MENGGABUNGKAN SEMUA KATEGORI KOLOM)
        // =========================================================================
        let anggaran = 0;
        colAnggaran.forEach(idx => {
            anggaran += parseIndonesianNumber(row[idx]);
        });

        let realisasi = 0;
        colRealisasi.forEach(idx => {
            realisasi += parseIndonesianNumber(row[idx]);
        });

        let selisih = realisasi - anggaran;
        let persentase = anggaran > 0 ? ((realisasi / anggaran) * 100).toFixed(2) : '0,00';
        // =========================================================================

        let paddingLevel = 0; let textStyle = ''; let isRincian = false;
        let isBarisJumlah = textUraian.includes('jumlah') || textUraian === 'total' || textUraian.includes('surplus') || textUraian.includes('defisit');
        let isRowKodeText = (textCol1 === 'kode' || textUraian.includes('uraian urusan, organisasi'));

        // =========================================================================
        // 3. LOGIKA HIERARKI UNIVERSAL (ANTI-HANCUR UNTUK PENDAPATAN & PEMBIAYAAN)
        // =========================================================================
        if (isBarisJumlah) {
            paddingLevel = 1; textStyle = 'style-bold'; isRincian = false;
        } else if (isRowKodeText) {
            paddingLevel = 0; textStyle = 'style-header'; isRincian = false;
        } else if (!kodeRekening && uraian) {
            // Rincian manual tanpa kode sama sekali
            paddingLevel = 10; textStyle = 'style-normal'; isRincian = true;
        } else if (col4) { 
            // -----------------------------------------------------------
            // INI BARIS AKUN REKENING (CERDAS: Universal untuk 4, 5, dan 6)
            // -----------------------------------------------------------
            let tailBlocks = col4.split('.');
            paddingLevel = 3 + tailBlocks.length; 
            
            // Di format SIPD, rincian terbawah selalu memiliki > 5 blok angka (cth: 5.1.02.01.001.00024)
            if (tailBlocks.length <= 5) { 
                textStyle = 'style-bold'; isRincian = false; 
            } else { 
                textStyle = 'style-normal'; isRincian = true; 
            }
        } else {
            // -----------------------------------------------------------
            // INI BARIS STRUKTUR INDUK (Urusan/Organisasi/Program/Kegiatan)
            // -----------------------------------------------------------
            let dots = (kodeRekening.match(/\./g) || []).length;
            if (dots <= 1) {
                paddingLevel = 0; textStyle = 'style-header';
                if(!urusanDitemukan && textCol1 !== 'kode') { document.getElementById('metaUrusan').innerText = ": " + kodeRekening + " " + uraian; urusanDitemukan = true; }
            } else if (kodeRekening.endsWith('.0000') || dots === 7 || dots === 8) {
                paddingLevel = 1; textStyle = 'style-bold';
                if(!kodeSkpdAktif && textCol1 !== 'kode') {
                    kodeSkpdAktif = kodeRekening; 
                    document.getElementById('metaOrganisasi').innerText = ": " + kodeRekening + " " + uraian;
                }
            } else if (dots === 2 || dots === 3) { 
                paddingLevel = 1; textStyle = 'style-bold'; 
            } else if (dots === 4) { 
                paddingLevel = 2; textStyle = 'style-italic'; 
            } else { 
                paddingLevel = 3; textStyle = 'style-bold'; 
            }
        }

        let displayKode = isRowKodeText ? col1 : kodeRekening;
        if (kodeSkpdAktif && displayKode.startsWith(kodeSkpdAktif + '.') && paddingLevel > 1) {
            displayKode = displayKode.substring(kodeSkpdAktif.length + 1);
        }

        let filePenjelasanHtml = '';
        let cleanUraian = uraian.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        let cleanKode = displayKode ? displayKode.replace(/'/g, "\\'") : '';
        
        let safeKode = trackerKode.replace(/[^a-zA-Z0-9]/g, "");
        let safeUraian = uraian.substring(0, 25).replace(/[^a-zA-Z0-9]/g, "");
        let rowID = `R_${safeKode}_${safeUraian}`;

        // =========================================================================
        // 4. RENDER TOMBOL CERDAS (DESAIN MINIMALIS & PREMIUM)
        // =========================================================================
        if (isBarisJumlah) {
            // Kosong, tanpa tombol untuk baris surplus/defisit/jumlah
        } else if (isRincian) {
            filePenjelasanHtml = `
                <div class="no-print">
                    <button id="btn_${rowID}" class="btn btn-sm w-100 text-start" 
                            style="font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #ffffff; border: 1px solid #cbd5e1; color: #475569; border-radius: 4px; transition: all 0.2s;"
                            onclick="bukaAsisten('${rowID}', '${cleanKode}', '${cleanUraian}', ${realisasi})">
                        <i class="fa-regular fa-pen-to-square text-secondary me-1"></i> Isi Penjelasan Rincian Belanja
                    </button>
                </div>
                <div id="print_${rowID}" class="print-view-text"></div>
                <input type="hidden" id="val_${rowID}" class="input-database" data-rowid="${rowID}" data-realisasi="${realisasi}">
            `;
        } else {
            filePenjelasanHtml = `
                <div class="no-print">
                    <button id="btn_${rowID}" class="btn btn-sm w-100 text-start" 
                            style="font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #ffffff; border: 1px solid #e2e8f0; color: #64748b; border-radius: 4px; transition: all 0.2s;"
                            onclick="bukaKeterangan('${rowID}', '${cleanKode}', '${cleanUraian}')">
                        <i class="fa-regular fa-comment-dots text-muted me-1"></i>
                    </button>
                </div>
                <div id="print_${rowID}" class="print-view-text fw-bold text-dark" style="margin-top: 5px; font-size: 11px;"></div>
                <input type="hidden" id="val_${rowID}" class="input-database" data-rowid="${rowID}" data-realisasi="0">
            `;
        }

        let formatRp = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
        let strAng = anggaran !== 0 ? anggaran.toLocaleString('id-ID', formatRp) : '0,00';
        let strRea = realisasi !== 0 ? realisasi.toLocaleString('id-ID', formatRp) : '0,00';
        let strSel = selisih !== 0 ? (selisih < 0 ? '(' + Math.abs(selisih).toLocaleString('id-ID', formatRp) + ')' : selisih.toLocaleString('id-ID', formatRp)) : '0,00';
        let strPersen = persentase.replace('.', ',');

        if (isRowKodeText) {
            strAng = ''; strRea = ''; strSel = ''; strPersen = ''; displayKode = col1; 
        }
        
        let tr = document.createElement('tr');
        tr.className = `pad-lvl-${paddingLevel} ${textStyle}`;
        tr.dataset.pad = paddingLevel;

        // ---> MULAI SISIPAN PASPOR GAIB (TRIANGULASI AI 3 LAPIS) <---
        let kategori = 'induk';
        if (isRincian && !isBarisJumlah) {
            
            // LAPIS 1: SENSOR POSISI UANG (Membaca Angka dari Kolom Excel)
            let valOperasi = 0; colOperasi.forEach(idx => { valOperasi += Math.abs(parseIndonesianNumber(row[idx])); });
            let valModal = 0; colModal.forEach(idx => { valModal += Math.abs(parseIndonesianNumber(row[idx])); });
            let valBtt = 0; colBtt.forEach(idx => { valBtt += Math.abs(parseIndonesianNumber(row[idx])); });
            let valTransfer = 0; colTransfer.forEach(idx => { valTransfer += Math.abs(parseIndonesianNumber(row[idx])); });

            let teksUraianLcase = textUraian.toLowerCase();

            // Eksekusi Sensor 1: Lihat uangnya jatuh di bawah kolom apa?
            if (valOperasi > 0 && valModal === 0 && valBtt === 0 && valTransfer === 0) {
                kategori = 'operasi'; 
            } else if (valModal > 0 && valOperasi === 0 && valBtt === 0 && valTransfer === 0) {
                kategori = 'modal';   
            } else if (valBtt > 0 && valOperasi === 0 && valModal === 0 && valTransfer === 0) {
                kategori = 'btt';
            } else if (valTransfer > 0 && valOperasi === 0 && valModal === 0 && valBtt === 0) {
                kategori = 'transfer';
            }
            // LAPIS 2: SENSOR LINGUISTIK (Kamus Otak AI - Jika nilai uang nol/rincian teks)
            else if (teksUraianLcase.includes('tak terduga') || teksUraianLcase.includes('darurat') || teksUraianLcase.includes('kejadian luar biasa')) {
                kategori = 'btt';
            } else if (teksUraianLcase.includes('transfer') || teksUraianLcase.includes('bantuan keuangan') || teksUraianLcase.includes('bagi hasil') || teksUraianLcase.includes('bantuan sosial') || teksUraianLcase.includes('hibah') || teksUraianLcase.includes('subsidi') || teksUraianLcase.includes('dana desa')) {
                kategori = 'transfer';
            } else if (teksUraianLcase.includes('honor') || teksUraianLcase.includes('jasa') || teksUraianLcase.includes('barang') || teksUraianLcase.includes('makan') || teksUraianLcase.includes('perjalanan') || teksUraianLcase.includes('atk') || teksUraianLcase.includes('gaji') || teksUraianLcase.includes('kertas') || teksUraianLcase.includes('cetak') || teksUraianLcase.includes('habis pakai') || teksUraianLcase.includes('listrik') || teksUraianLcase.includes('air') || teksUraianLcase.includes('sewa')) {
                kategori = 'operasi';
            } else if (teksUraianLcase.includes('modal') || teksUraianLcase.includes('aset') || teksUraianLcase.includes('tanah') || teksUraianLcase.includes('mesin') || teksUraianLcase.includes('gedung') || teksUraianLcase.includes('bangunan') || teksUraianLcase.includes('jalan') || teksUraianLcase.includes('jaringan') || teksUraianLcase.includes('irigasi') || teksUraianLcase.includes('peralatan') || teksUraianLcase.includes('kendaraan')) {
                kategori = 'modal';
            } 
            // LAPIS 3: SENSOR KODE STANDAR (Hanya Sebagai Jaring Pengaman Terakhir)
            else if (kodeRekening.startsWith('5.1') || trackerKode.startsWith('5.1')) kategori = 'operasi';
            else if (kodeRekening.startsWith('5.2') || trackerKode.startsWith('5.2')) kategori = 'modal';
            else if (kodeRekening.startsWith('5.3') || trackerKode.startsWith('5.3')) kategori = 'btt';
            else if (kodeRekening.startsWith('5.4') || trackerKode.startsWith('5.4')) kategori = 'transfer';
            else kategori = 'lainnya'; 
        }
        tr.dataset.kategori = kategori;
        
        // +++++ MEMORI REKALKULASI DINAMIS +++++
        tr.dataset.oriAng = anggaran || 0;
        tr.dataset.oriRea = realisasi || 0;
        tr.dataset.oriAngStr = strAng;
        tr.dataset.oriReaStr = strRea;
        tr.dataset.oriSelStr = strSel;
        tr.dataset.oriPerStr = strPersen;
        // ---> AKHIR SISIPAN <---

        // TAMBAHAN KOSMETIK BOS: Jika ini baris jumlah, buat Center, Kapital, dan Tebal!
        let kelasUraian = isBarisJumlah ? "uraian-cell text-center text-uppercase fw-bold text-dark" : "uraian-cell";

        tr.innerHTML = `
            <td>${displayKode}</td>
            <td class="${kelasUraian}">${uraian}</td>
            <td class="text-end">${strAng}</td>
            <td class="text-end">${strRea}</td>
            <td class="text-end">${strSel}</td>
            <td class="text-center">${strPersen}</td>
            <td class="cell-penjelasan">${filePenjelasanHtml}</td>
        `;
        tbody.appendChild(tr);
    }
    
    // Panggil ulang sensor TTD setelah kode SKPD terdeteksi
    updateInfoTandaTangan();
    terapkanFilterBelanja();
}

function bukaKeterangan(rowID, kodeRek, uraian) {
    let nilaiLama = document.getElementById('val_' + rowID).value;
    document.getElementById('modalKetTargetRow').value = rowID;
    
    let judulRekening = kodeRek ? `${kodeRek} - ${uraian}` : uraian;
    document.getElementById('modalKetUraian').innerText = judulRekening;
    document.getElementById('modalKetTextarea').value = nilaiLama;
    modalKeterangan.show();
}

function simpanKeterangan() {
    let rowID = document.getElementById('modalKetTargetRow').value;
    let teks = document.getElementById('modalKetTextarea').value;
    
    document.getElementById('val_' + rowID).value = teks;
    document.getElementById('val_' + rowID).classList.add('is-dirty'); // <--- SENSOR BARIS BARU DIEDIT
    document.getElementById('print_' + rowID).innerText = teks;
    
    let btn = document.getElementById('btn_' + rowID);
    if (btn) {
        if (teks.trim() === '') {
            btn.className = 'btn btn-sm w-100 text-start';
            btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #ffffff; border: 1px solid #e2e8f0; color: #64748b; border-radius: 4px;";
            btn.innerHTML = '<i class="fa-regular fa-comment-dots text-muted me-1"></i> Isi Keterangan';
        } else {
            btn.className = 'btn btn-sm w-100 text-start fw-bold';
            btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #f8fafc; border: 1px solid #cbd5e1; color: #334155; border-radius: 4px;";
            btn.innerHTML = '<i class="fa-solid fa-check text-muted me-1"></i> Keterangan Disimpan';
        }
    }
    modalKeterangan.hide();
}

function hitungTotalDariTeks(teks) {
    let total = 0;
    let regex = /=\s*([^#\n\r]+)/g; 
    let matches = teks.match(regex);
    if(matches) {
        matches.forEach(m => {
            let cleanStr = m.replace(/=/g, '').replace(/Rp/gi, '').trim();
            let numMatch = cleanStr.match(/^[\d\.,]+/);
            if (numMatch) {
                let numStr = numMatch[0];
                if(numStr.includes(',') && numStr.split(',')[1].length <= 2) {
                    numStr = numStr.replace(/\./g, '').replace(',', '.');
                } else {
                    numStr = numStr.replace(/\./g, '').replace(/,/g, '');
                }
                let val = parseFloat(numStr);
                if(!isNaN(val)) total += val;
            }
        });
    }
    return total;
}

function formatRibuan(input) {
    let value = input.value.replace(/[^,\d]/g, '');
    let parts = value.split(',');
    let sisa = parts[0].length % 3;
    let rupiah = parts[0].substr(0, sisa);
    let ribuan = parts[0].substr(sisa).match(/\d{3}/gi);
    
    if (ribuan) {
        let separator = sisa ? '.' : '';
        rupiah += separator + ribuan.join('.');
    }
    input.value = parts[1] !== undefined ? rupiah + ',' + parts[1] : rupiah;
}

function perbaruiTombolStatus(rowID, printText, realisasi) {
    let btn = document.getElementById('btn_' + rowID);
    if(!btn) return;
    
    let totalHitung = hitungTotalDariTeks(printText);
    let selisih = totalHitung - realisasi;
    let formatRp = { minimumFractionDigits: 0 };
    
    let teksBersih = printText.replace(/<[^>]*>?/gm, ''); 
    let statusTeks = cekKualitasTeks(teksBersih);
    
    btn.className = 'btn btn-sm w-100 text-start';

    if (teksBersih.trim() === '') {
        btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #ffffff; border: 1px solid #cbd5e1; color: #475569; border-radius: 4px;";
        btn.innerHTML = '<i class="fa-regular fa-pen-to-square text-secondary me-1"></i> Isi Penjelasan';
    } else if (realisasi === 0 && printText.trim() !== '') {
        btn.className = 'btn btn-sm w-100 text-start fw-bold';
        btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 4px;";
        btn.innerHTML = '<i class="fa-solid fa-check-double text-success me-1"></i> Murni Tersimpan';
    } else if (Math.abs(selisih) < 1) { 
        if (statusTeks !== "OK") { // KETAHUAN BOHONG
            btn.className = 'btn btn-sm w-100 text-start fw-bold';
            btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #fef2f2; border: 1px solid #fecdd3; color: #991b1b; border-radius: 4px;";
            btn.innerHTML = `<i class="fa-solid fa-circle-exclamation text-danger me-1"></i> Draf: ${statusTeks}`;
        } else { // 100% LULUS UJI MURNI
            btn.className = 'btn btn-sm w-100 text-start fw-bold';
            btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 4px;";
            btn.innerHTML = '<i class="fa-solid fa-check-double text-success me-1"></i> Murni & Valid';
        }
    } else if (selisih < 0) { 
        let fKurang = Math.abs(selisih).toLocaleString('id-ID', formatRp);
        btn.className = 'btn btn-sm w-100 text-start fw-bold';
        btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #fffde7; border: 1px solid #fef08a; color: #854d0e; border-radius: 4px;";
        btn.innerHTML = `<i class="fa-solid fa-file-pen text-warning me-1"></i> Draf (Kurang Rp ${fKurang})`;
    } else { 
        let fLebih = selisih.toLocaleString('id-ID', formatRp);
        btn.className = 'btn btn-sm w-100 text-start fw-bold';
        btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #fef2f2; border: 1px solid #fecdd3; color: #991b1b; border-radius: 4px;";
        btn.innerHTML = `<i class="fa-solid fa-circle-xmark text-danger me-1"></i> Draf (Lebih Rp ${fLebih})`;
    }
}

function setMode() {
    setTimeout(() => { kalkulasiKombinasi(); }, 100); 
}

// === 1. GLOBAL VARIABEL BARU UNTUK MULTI-KELOMPOK ===
let groupIdCounter = 0;

// === FUNGSI SAKTI: AUTO-NUMBERING KELOMPOK (ANTI-BOLONG) ===
function updateNomorUrutKelompok() {
    let groups = document.querySelectorAll('#groupsContainer .group-container');
    groups.forEach((group, index) => {
        let badge = group.querySelector('.group-number-badge');
        if (badge) badge.innerText = index + 1; // Selalu terurut mulai dari 1, 2, 3...
    });
}

// === 2. FUNGSI BARU: PENCIPTA KELOMPOK LOKASI/KEGIATAN ===
function tambahKelompok(subText = "", items = []) {
    groupIdCounter++;
    let gId = 'group_' + groupIdCounter;
    let container = document.getElementById('groupsContainer');
    
    let groupDiv = document.createElement('div');
    groupDiv.className = "group-container border bg-white p-4 mb-4 position-relative shadow-sm";
    groupDiv.style.borderRadius = "10px";
    groupDiv.style.border = "1px solid #e2e8f0";
    groupDiv.id = gId;
    
    // UI CERDAS: Tombol Hapus Grup (Panggil juga updateNomorUrutKelompok saat dihapus)
    groupDiv.innerHTML = `
        <button class="btn btn-sm btn-outline-danger position-absolute top-0 end-0 m-3" 
                onclick="document.getElementById('${gId}').remove(); kalkulasiKombinasi(); updateNomorUrutKelompok();" 
                title="Hapus Kelompok" 
                style="border-radius: 50%; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
            <i class="fa-solid fa-trash-can" style="font-size: 12px;"></i>
        </button>

        <div class="row mb-3">
            <div class="col-12 mb-3 pe-5">
                <label class="form-label fw-bold text-secondary d-flex align-items-center" style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">
                    <span class="group-number-badge text-white bg-primary d-flex align-items-center justify-content-center me-2" style="width: 20px; height: 20px; border-radius: 50%; font-size: 11px;">1</span>
                    Keterangan Lokasi / Kegiatan / Tgl
                </label>
                <textarea class="form-control textarea-smart p-2 uraian-sub" rows="2" placeholder="Contoh: Perjalanan dinas ke Makassar..." onkeyup="kalkulasiKombinasi()">${subText}</textarea>
            </div>
        </div>

        <div class="row mb-2 fw-bold text-secondary pb-1" style="font-size: 10px; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">
            <div class="col-4">Uraian Rincian Belanja</div>
            <div class="col-2 text-center">Vol</div>
            <div class="col-2 text-center">Satuan</div>
            <div class="col-3 text-end">Harga (Rp)</div>
            <div class="col-1 text-end">Total</div>
        </div>
        
        <div id="rows_${gId}" class="item-rows-container mb-3"></div>
        
        <button class="btn btn-sm btn-outline-secondary fw-bold text-secondary w-100 py-1" onclick="tambahBaris('${gId}')" style="font-size: 11px; border-radius: 6px; border-style: dashed; border-width: 1px;">
            <i class="fa-solid fa-plus me-1"></i> Tambah Baris Rincian
        </button>
    `;
    
    container.appendChild(groupDiv);
    
    // PEMANGGILAN NOMOR URUT SAAT KELOMPOK DITAMBAHKAN
    updateNomorUrutKelompok();

    if (items.length === 0) {
        tambahBaris(gId);
    } else {
        items.forEach(item => tambahBaris(gId, item.u, item.v, item.s, item.h));
    }
    kalkulasiKombinasi();
    
    setTimeout(() => { groupDiv.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 100);
}

// === 3. FUNGSI TAMBAH BARIS YANG DIPERBARUI (Fokus per Kelompok) ===
function tambahBaris(groupId, ur = "", v = "", s = "", h = "") {
    let container = document.getElementById('rows_' + groupId);
    let div = document.createElement('div');
    
    div.className = "row mb-3 align-items-center pb-2 border-bottom border-light"; 
    let hFormatted = h ? h.toLocaleString('id-ID') : "";

    div.innerHTML = `
        <div class="col-4">
            <textarea class="form-control textarea-smart p-2 uraian" rows="2" placeholder="Masukkan uraian belanja" style="font-size: 12px; resize: vertical;">${ur}</textarea>
        </div>
        <div class="col-2">
            <input type="number" class="form-control form-control-sm text-center border-light-subtle shadow-none vol" placeholder="Vol" oninput="kalkulasiKombinasi()" value="${v}" style="font-size: 12px; background-color: #f8fafc;">
        </div>
        <div class="col-2">
            <input type="text" class="form-control form-control-sm text-center border-light-subtle shadow-none satuan" placeholder="Satuan" value="${s}" style="font-size: 12px; background-color: #f8fafc;">
        </div>
        <div class="col-3">
            <input type="text" class="form-control form-control-sm text-end border-light-subtle shadow-none harga" placeholder="Harga (Rp)" oninput="formatRibuan(this); kalkulasiKombinasi()" value="${hFormatted}" style="font-size: 12px; background-color: #f8fafc;">
        </div>
        <div class="col-1 d-flex flex-column align-items-end justify-content-center">
            <div class="fw-bold subtotal-txt text-dark mb-1" style="font-size: 12px; letter-spacing: 0.3px;">0</div>
            <button class="btn btn-sm p-0 border-0 shadow-none text-danger" 
                    style="opacity: 0.5; transition: all 0.2s ease-in-out;" 
                    onmouseover="this.style.opacity='1'; this.style.transform='scale(1.1)';" 
                    onmouseout="this.style.opacity='0.5'; this.style.transform='scale(1)';" 
                    onclick="this.parentElement.parentElement.remove(); kalkulasiKombinasi();" title="Hapus Baris">
                <i class="fa-regular fa-trash-can" style="font-size: 14px;"></i>
            </button>
        </div>
    `;
    container.appendChild(div);
    kalkulasiKombinasi();
}

// === 4. BUKA ASISTEN (Penyelamat Data Masa Lalu) ===
function bukaAsisten(rowID, kodeRek, uraian, realisasi) {
    let nilaiLama = document.getElementById('val_' + rowID).value;
    document.getElementById('modalTargetRow').value = rowID;
    document.getElementById('modalTargetRealisasi').value = realisasi;
    
    document.getElementById('modalUraian').innerText = kodeRek ? `${kodeRek} - ${uraian}` : uraian;
    document.getElementById('modalRealisasiTxt').innerText = "Rp " + realisasi.toLocaleString('id-ID');
    
    // Bersihkan layar
    document.getElementById('groupsContainer').innerHTML = '';
    groupIdCounter = 0;
    
    let groupsData = [];

    if (nilaiLama && nilaiLama.trim() !== "") {
        try { 
            let parsed = JSON.parse(nilaiLama); 
            // Cek jika datanya sudah Array (Format Super Baru)
            if (Array.isArray(parsed) && parsed[0].items !== undefined) {
                groupsData = parsed;
            } 
            // Cek Format Lama (Hanya 1 grup)
            else if (parsed.items) {
                let textSub = parsed.sub || parsed.judul || "";
                groupsData = [{ sub: textSub, items: parsed.items }];
            } 
            // Cek Format Sangat Lama (V.1)
            else if (parsed.data && Array.isArray(parsed.data)) {
                groupsData = [{ sub: "", items: parsed.data }];
            } else if (parsed.data && typeof parsed.data === 'string') {
                groupsData = [{ sub: parsed.data, items: [] }];
            }
        } catch(e) { 
            groupsData = [{ sub: nilaiLama, items: [] }];
        }
    }

    if (groupsData.length === 0) {
        tambahKelompok(); // Default buat 1 grup kosong
    } else {
        groupsData.forEach(g => tambahKelompok(g.sub, g.items));
    }
    
    kalkulasiKombinasi();
    modalAsisten.show();
}

// === KALKULASI MENYELURUH (Scan Seluruh Kelompok + Wasit Tombol Ganda) ===
function kalkulasiKombinasi() {
    let realisasi = parseFloat(document.getElementById('modalTargetRealisasi').value);
    let totalHitung = 0;
    let isKosong = true;
    let teksGabungan = ""; // Untuk Lie Detector

    document.querySelectorAll('.group-container').forEach(group => {
        let sub = group.querySelector('.uraian-sub').value.trim();
        if(sub) { isKosong = false; teksGabungan += sub + " "; }

        group.querySelectorAll('.item-rows-container .row').forEach(row => {
            let v = parseFloat(row.querySelector('.vol').value) || 0;
            let hStr = row.querySelector('.harga').value.replace(/\./g, '').replace(/,/g, '.');
            let h = parseFloat(hStr) || 0;
            let subtotal = v * h;
            row.querySelector('.subtotal-txt').innerText = subtotal.toLocaleString('id-ID');
            totalHitung += subtotal;
            
            let ur = row.querySelector('.uraian').value.trim();
            if(ur || v > 0 || h > 0) isKosong = false;
            if(ur) teksGabungan += ur + " ";
        });
    });

    let alertBox = document.getElementById('alertSmart');
    let icon = document.getElementById('iconSmart');
    let title = document.getElementById('titleSmart');
    let desc = document.getElementById('descSmart');
    let selisih = totalHitung - realisasi;
    
    // TOMBOL GANDA (Lampu Lalu Lintas)
    let btnDraft = document.getElementById('btnSimpanDraft');
    let btnFinal = document.getElementById('btnSimpanFinal');

    // Eksekusi Detektor
    let statusTeks = cekKualitasTeks(teksGabungan);
    let isBalance = (realisasi > 0 && Math.abs(selisih) < 1);
    
    // Sensor Anti Copy-Paste (Lapis 2)
    let memoriCopyPaste = sessionStorage.getItem('last_saved_text') || "";
    let teksKunci = teksGabungan.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    let isCopyPaste = (teksKunci.length > 20 && memoriCopyPaste === teksKunci);

    if (isKosong) {
        alertBox.className = 'alert alert-pro alert-pro-info d-flex align-items-center mb-0 py-2 px-3';
        icon.className = 'fa-solid fa-pen-to-square fs-4 me-3 text-secondary';
        title.innerText = 'Silahkan input rincian anda';
        desc.innerText = 'Gunakan tombol di bawah untuk menambah kelompok lokasi atau rincian.';
        if(btnDraft) { btnDraft.style.display = 'inline-block'; btnFinal.style.display = 'none'; }
    } else if (realisasi === 0) {
        alertBox.className = 'alert alert-pro alert-pro-info d-flex align-items-center mb-0 py-2 px-3';
        icon.className = 'fa-solid fa-info-circle fs-4 me-3 text-info';
        title.innerText = 'Nilai Realisasi Nol (0)';
        desc.innerText = 'Catatan akan dilampirkan sebagai penjelas nilai kosong ini.';
        if(btnDraft) { btnDraft.style.display = 'none'; btnFinal.style.display = 'inline-block'; } // Bebas Final
    } else if (isBalance) {
        if (statusTeks !== "OK") {
            // BALANCE TAPI NGAWUR (BOHONG) -> PAKSA TOMBOL DRAF!
            alertBox.className = 'alert alert-pro alert-pro-danger d-flex align-items-center mb-0 py-2 px-3';
            icon.className = 'fa-solid fa-circle-exclamation fs-4 me-3 text-danger';
            title.innerText = 'ANGKA SESUAI, TAPI PENJELASAN DITOLAK!';
            desc.innerHTML = `Total Rp${totalHitung.toLocaleString('id-ID')} sesuai, tapi <b>${statusTeks}</b>!`;
            if(btnDraft) { btnDraft.style.display = 'inline-block'; btnFinal.style.display = 'none'; }
        } else if (isCopyPaste) {
            // BALANCE TAPI COPY-PASTE BARU SAJA -> PAKSA TOMBOL DRAF!
            alertBox.className = 'alert alert-pro alert-pro-warning d-flex align-items-center mb-0 py-2 px-3';
            icon.className = 'fa-solid fa-copy fs-4 me-3 text-warning';
            title.innerText = 'INDIKASI COPY-PASTE TERDETEKSI!';
            desc.innerHTML = `Penjelasan Anda 100% mirip dengan rincian yang baru saja Anda simpan. Bedakan isinya!`;
            if(btnDraft) { btnDraft.style.display = 'inline-block'; btnFinal.style.display = 'none'; }
        } else {
            // MURNI SEMPURNA -> TOMBOL FINAL MUNCUL, DRAF HILANG!
            alertBox.className = 'alert alert-pro alert-pro-success d-flex align-items-center mb-0 py-2 px-3';
            icon.className = 'fa-solid fa-check-double fs-4 me-3 text-success';
            title.innerText = 'JUMLAH MURNI SESUAI & VALID';
            desc.innerText = `Perhitungan Rp${totalHitung.toLocaleString('id-ID')} akurat dan teks logis. Siap Simpan Final!`;
            if(btnDraft) { btnDraft.style.display = 'none'; btnFinal.style.display = 'inline-block'; }
        }
    } else if (selisih < 0) {
        // KURANG (BARU NYICIL) -> TOMBOL DRAF MUNCUL
        alertBox.className = 'alert alert-pro alert-pro-warning d-flex align-items-center mb-0 py-2 px-3';
        icon.className = 'fa-solid fa-triangle-exclamation fs-4 me-3 text-warning';
        title.innerText = 'NILAI MASIH KURANG DARI REALISASI';
        desc.innerHTML = `Terinput: <b>Rp${totalHitung.toLocaleString('id-ID')}</b>. Selisih kurang: <b>Rp${Math.abs(selisih).toLocaleString('id-ID')}</b>.`;
        if(btnDraft) { btnDraft.style.display = 'inline-block'; btnFinal.style.display = 'none'; }
    } else {
        // LEBIH (SALAH KETIK) -> TOMBOL DRAF MUNCUL
        alertBox.className = 'alert alert-pro alert-pro-danger d-flex align-items-center mb-0 py-2 px-3';
        icon.className = 'fa-solid fa-circle-xmark fs-4 me-3 text-danger';
        title.innerText = 'JUMLAH MELEBIHI REALISASI';
        desc.innerHTML = `Melebihi SIPD sebesar <b>Rp${selisih.toLocaleString('id-ID')}</b>. Periksa angka Anda!`;
        if(btnDraft) { btnDraft.style.display = 'inline-block'; btnFinal.style.display = 'none'; }
    }
}

// === 6. SIMPAN DARI MODAL (Merakit Array Multi-Grup) ===
function simpanDariModal() {
    let rowID = document.getElementById('modalTargetRow').value;
    let realisasi = parseFloat(document.getElementById('modalTargetRealisasi').value);
    
    let groupsToSave = [];
    let textToPrint = "";

    // Sapu bersih semua grup di layar
    document.querySelectorAll('.group-container').forEach(group => {
        let sub = group.querySelector('.uraian-sub').value.trim();
        let dataJSON = [];
        let groupPrintText = "";

        if (sub) groupPrintText += `${sub}\n\n`; 

        group.querySelectorAll('.item-rows-container .row').forEach(row => {
            let ur = row.querySelector('.uraian').value.trim();
            let v = parseFloat(row.querySelector('.vol').value) || 0;
            let s = row.querySelector('.satuan').value.trim();
            let hStr = row.querySelector('.harga').value.replace(/\./g, '').replace(/,/g, '.');
            let h = parseFloat(hStr) || 0;
            let t = v * h;
            
            if (ur || v > 0 || h > 0) {
                dataJSON.push({u: ur, v: v, s: s, h: h, t: t});
                let st = s ? ` ${s}` : '';
                groupPrintText += `- ${ur}\n<div style="border-bottom: 1px dashed #666; padding-bottom: 4px; margin-bottom: 4px;"><em>${v} ${st} x Rp ${h.toLocaleString('id-ID')} = Rp ${t.toLocaleString('id-ID')}</em></div>`;
            }
        });

        // Simpan grup jika ada isinya
        if (sub || dataJSON.length > 0) {
            groupsToSave.push({ sub: sub, items: dataJSON });
            textToPrint += groupPrintText + "\n"; // Beri jarak antar grup saat dicetak
        }
    });
        
        let teksKunci = textToPrint.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (teksKunci.length > 20) {
        sessionStorage.setItem('last_saved_text', teksKunci);
    }
        
    let valToSave = JSON.stringify(groupsToSave);
    
    document.getElementById('val_' + rowID).value = valToSave;
    document.getElementById('val_' + rowID).classList.add('is-dirty'); // <--- SENSOR BARIS BARU DIEDIT
    document.getElementById('print_' + rowID).innerHTML = textToPrint.trim();
    
    perbaruiTombolStatus(rowID, textToPrint, realisasi);
    modalAsisten.hide();
}

// =========================================================================
// MESIN PAGINASI CERDAS (ANTI-BOLONG) — SMART SPLIT-PAGINATION ENGINE
// =========================================================================
// Strategi: ketika sebuah baris tidak muat di sisa halaman, pecah isi
// PENJELASAN secara granular (node-per-node, lalu karakter-per-karakter
// via binary search). Bagian yang muat tetap di halaman saat ini; sisanya
// dibungkus jadi "baris lanjutan" dengan kolom data KOSONG — sehingga
// penjelasan terlepas dari judul/rincian dan kertas tidak ada yang kosong.
// =========================================================================

// Helper: binary search panjang teks maksimal yang muat di sisa halaman.
// makeProbe(len) -> Node yang akan diuji. Mengembalikan jumlah karakter terbesar yang pas.
function binarySearchFit(makeProbe, penjelasanDiv, clone, maxBottom, maxLen) {
    let lo = 0, hi = maxLen, best = 0;
    while (lo <= hi) {
        let mid = Math.floor((lo + hi) / 2);
        let probe = makeProbe(mid);
        penjelasanDiv.appendChild(probe);
        let bottom = clone.getBoundingClientRect().bottom;
        penjelasanDiv.removeChild(probe);
        if (bottom <= maxBottom) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return best;
}

// Helper: cari word boundary terdekat sebelum posisi best (prefer newline > space > hard cut).
function findWordBoundary(text, best) {
    let breakAt = best;
    let lastNL = text.lastIndexOf('\n', best - 1);
    if (lastNL > best * 0.5) return lastNL + 1;
    let lastSpace = text.lastIndexOf(' ', best - 1);
    if (lastSpace > best * 0.5) return lastSpace + 1;
    return breakAt;
}

// Helper utama: coba pecah penjelasan pada clone (baris) agar muat di maxBottom.
// Return { success: true, remainingHTML: '...' } jika pecah berhasil.
// Return { success: false } jika tidak bisa dipecah (baris data saja sudah tidak muat, atau tidak ada penjelasan).
function trySplitPenjelasan(clone, maxBottom) {
    let penjelasanDiv = clone.querySelector('.print-view-text');
    if (!penjelasanDiv) return { success: false };

    let originalHTML = penjelasanDiv.innerHTML;
    let originalText = penjelasanDiv.innerText;
    if (!originalText.trim()) return { success: false };

    // === TAHAP 1: Ukur baseline (baris data tanpa penjelasan) ===
    penjelasanDiv.innerHTML = '';
    let baselineBottom = clone.getBoundingClientRect().bottom;

    // Kalau baris data saja sudah tidak muat → tidak bisa dipecah
    if (baselineBottom > maxBottom) {
        penjelasanDiv.innerHTML = originalHTML;
        return { success: false };
    }

    let availablePx = maxBottom - baselineBottom;
    let minLineH = 14; // tinggi minimal satu baris teks 11px dengan line-height 1.15

    // Sisa ruang kurang dari satu baris → tidak bisa dipecah
    if (availablePx < minLineH) {
        penjelasanDiv.innerHTML = originalHTML;
        return { success: false };
    }

    // === TAHAP 2: Snapshot childNodes asli (teks + <div> harga + ...) ===
    penjelasanDiv.innerHTML = originalHTML;
    let originalNodes = Array.from(penjelasanDiv.childNodes);

    // === TAHAP 3: Rebuild node-per-node sampai ketemu yang tidak muat ===
    penjelasanDiv.innerHTML = '';
    let remainingNodes = [];
    let splitDone = false;

    for (let node of originalNodes) {
        if (splitDone) {
            remainingNodes.push(node);
            continue;
        }

        penjelasanDiv.appendChild(node.cloneNode(true));
        let testBottom = clone.getBoundingClientRect().bottom;

        if (testBottom > maxBottom) {
            // Node ini tidak muat → coba pecah di level karakter
            penjelasanDiv.removeChild(penjelasanDiv.lastChild);
            let didSplit = false;

            if (node.nodeType === Node.TEXT_NODE) {
                let text = node.textContent;
                let best = binarySearchFit(
                    (len) => document.createTextNode(text.substring(0, len)),
                    penjelasanDiv, clone, maxBottom, text.length
                );
                if (best > 0) {
                    let breakAt = findWordBoundary(text, best);
                    let firstPart = text.substring(0, breakAt);
                    let restPart = text.substring(breakAt);
                    if (firstPart.trim()) penjelasanDiv.appendChild(document.createTextNode(firstPart));
                    if (restPart.trim()) remainingNodes.unshift(document.createTextNode(restPart));
                    didSplit = true;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                let text = node.innerText || node.textContent || '';
                let best = binarySearchFit(
                    (len) => {
                        let e = node.cloneNode(false);
                        e.innerText = text.substring(0, len);
                        return e;
                    },
                    penjelasanDiv, clone, maxBottom, text.length
                );
                if (best > 0) {
                    let breakAt = findWordBoundary(text, best);
                    let firstPart = text.substring(0, breakAt);
                    let restPart = text.substring(breakAt);
                    if (firstPart.trim()) {
                        let firstElem = node.cloneNode(false);
                        firstElem.innerText = firstPart;
                        penjelasanDiv.appendChild(firstElem);
                    }
                    if (restPart.trim()) {
                        let restElem = node.cloneNode(false);
                        restElem.innerText = restPart;
                        remainingNodes.unshift(restElem);
                    }
                    didSplit = true;
                }
            }

            if (!didSplit) {
                // Node tidak bisa dipecah (best=0) → seluruh node pindah ke sisa
                remainingNodes.unshift(node);
            }
            splitDone = true;
        }
    }

    // === TAHAP 4: Validasi hasil pecahan ===
    let keptText = penjelasanDiv.innerText.trim();
    if (!keptText) {
        // Tidak ada konten yang muat → restore & nyatakan tidak bisa dipecah
        penjelasanDiv.innerHTML = originalHTML;
        return { success: false };
    }
    if (remainingNodes.length === 0) {
        // Semua muat — tidak perlu pecah (kasus jarang, measurement sudah benar)
        penjelasanDiv.innerHTML = originalHTML;
        return { success: false };
    }

    // Bungkus sisa nodes jadi HTML string untuk baris lanjutan
    let tempContainer = document.createElement('div');
    remainingNodes.forEach(n => tempContainer.appendChild(n));
    return {
        success: true,
        remainingHTML: tempContainer.innerHTML
    };
}

// Helper: bangun baris lanjutan dengan kolom data KOSONG, hanya berisi sisa penjelasan.
function buildContinuationRow(remainingHTML, padLevel) {
    let tr = document.createElement('tr');
    tr.className = `pad-lvl-${padLevel} style-rincian continuation-row`;
    tr.dataset.pad = padLevel;
    tr.innerHTML = `
        <td></td>
        <td class="uraian-cell" style="font-style: italic; color: #94a3b8; font-size: 9px; padding-top: 4px;">↳ lanjutan penjelasan</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td class="cell-penjelasan">
            <div class="print-view-text">${remainingHTML}</div>
        </td>
    `;
    return tr;
}

function cetakPro() {
    let tbodyLama = document.getElementById('containerRender');
    if(tbodyLama.children.length === 0 || tbodyLama.innerText.includes('Menunggu')) {
        Swal.fire('Data Kosong', 'Upload Excel LRA Per Pogram dari SIPD terlebih dahulu.', 'warning');
        return;
    }

    Swal.fire({ title: 'Tunggu Sebentar Yah...', text: 'Mesin Cerdas Sedang Menyusun Halaman...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});

    setTimeout(() => {
        let mulaiHalaman = parseInt(document.getElementById('inputHalaman').value) || 1;
        let rows = Array.from(tbodyLama.children);

        let wrapper = document.getElementById('printWrapper');
        wrapper.innerHTML = '';
        wrapper.style.display = 'block';

        document.querySelector('.container-fluid').style.display = 'none';
        document.querySelector('.print-page').style.display = 'none';

        let pageNum = mulaiHalaman;
        let currentPage = createPageTemplate(pageNum, true);
        wrapper.appendChild(currentPage);

        let currentTbody = currentPage.querySelector('.tbody-render');
        let currentFooter = currentPage.querySelector('.pdf-footer-pro');

        // === MESIN ANTRIAN CERDAS ===
        // Setiap item bisa: { type: 'row', source: <Node> } atau
        //                    { type: 'continuation', remainingHTML: '...', padLevel: N }
        let queue = rows.map(r => ({
            type: 'row',
            source: r,
            padLevel: parseInt(r.dataset.pad) || 0
        }));

        let safetyCounter = 0;
        const SAFETY_MAX = 10000; // anti-infinite-loop

        while (queue.length > 0 && safetyCounter < SAFETY_MAX) {
            safetyCounter++;
            let item = queue.shift();

            let clone;
            if (item.type === 'row') {
                clone = item.source.cloneNode(true);
            } else {
                clone = buildContinuationRow(item.remainingHTML, item.padLevel);
            }

            currentTbody.appendChild(clone);

            let rowRect = clone.getBoundingClientRect();
            let footerRect = currentFooter.getBoundingClientRect();
            let maxBottom = footerRect.top - 5; // toleransi 5px

            if (rowRect.bottom <= maxBottom) {
                // MUAT — lanjut ke item berikutnya
                continue;
            }

            // TIDAK MUAT — coba pecah penjelasan dulu
            let split = trySplitPenjelasan(clone, maxBottom);

            if (split.success) {
                // Pecah berhasil — sisa penjelasan masuk antrian paling depan
                queue.unshift({
                    type: 'continuation',
                    remainingHTML: split.remainingHTML,
                    padLevel: item.padLevel
                });
            } else {
                // Tidak bisa dipecah — pindah seluruh baris ke halaman baru
                currentTbody.removeChild(clone);
                pageNum++;
                currentPage = createPageTemplate(pageNum, false);
                wrapper.appendChild(currentPage);
                currentTbody = currentPage.querySelector('.tbody-render');
                currentFooter = currentPage.querySelector('.pdf-footer-pro');
                currentTbody.appendChild(clone);

                // Di halaman baru, jika baris masih lebih tinggi dari halaman penuh → pecah paksa
                let freshRect = clone.getBoundingClientRect();
                let freshFooter = currentFooter.getBoundingClientRect();
                let freshMaxBottom = freshFooter.top - 5;

                if (freshRect.bottom > freshMaxBottom) {
                    let forceSplit = trySplitPenjelasan(clone, freshMaxBottom);
                    if (forceSplit.success) {
                        queue.unshift({
                            type: 'continuation',
                            remainingHTML: forceSplit.remainingHTML,
                            padLevel: item.padLevel
                        });
                    }
                    // Jika force-split gagal, baris dibiarkan apa adanya (kasus ekstrem)
                }
            }
        }

        let tgl = document.getElementById('ttd-tanggal').innerText;
        let jab = document.getElementById('ttd-jabatan').innerText;
        let nma = document.getElementById('ttd-nama').innerText;
        let nip = document.getElementById('ttd-nip').innerText;

        let ttdNode = document.createElement('div');
        ttdNode.style = "display: flex; justify-content: flex-end; padding-right: 50px; margin-top: 20px;";
        ttdNode.innerHTML = `
            <div class="text-center" style="width: 250px; font-family: Arial, sans-serif; font-size: 11px; color: #000; line-height: 1.4;">
                <div style="margin-bottom: 2px;">${tgl}</div>
                <div class="fw-bold">${jab}</div>
                <div style="height: 55px;"></div>
                <div class="fw-bold text-decoration-underline">${nma}</div>
                <div>${nip}</div>
            </div>
        `;

        currentPage.insertBefore(ttdNode, currentFooter);
        let ttdRect = ttdNode.getBoundingClientRect();
        let currentFooterRect = currentFooter.getBoundingClientRect();

        if (ttdRect.bottom > (currentFooterRect.top - 5)) {
            currentPage.removeChild(ttdNode);
            pageNum++;
            currentPage = createPageTemplate(pageNum, false);
            wrapper.appendChild(currentPage);
            currentPage.insertBefore(ttdNode, currentPage.querySelector('.pdf-footer-pro'));
        }

        Swal.close();
        setTimeout(() => { window.print(); }, 1500);

    }, 500);
}

function createPageTemplate(pageNum, isFirstPage) {
    let div = document.createElement('div');
    div.style.cssText = "position: relative; width: 330mm; height: 210mm; padding: 10mm 5mm 10mm 15mm; margin: 0 auto 20px auto; background: #fff; box-sizing: border-box; overflow: hidden; page-break-after: always;";

    let tahun = document.getElementById('selectTahun').value;
    let periode = document.getElementById('selectPeriode').value;
    let urusan = document.getElementById('metaUrusan').innerText;
    let orgOri = document.getElementById('metaOrganisasi').innerText;
    let skpdBersih = orgOri.replace(/.*:\s*[0-9\.\-]+\s*/, ''); 

    let headerHTML = '';
    if (isFirstPage) {
        headerHTML = `
        <div style="display: flex; align-items: center; border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 15px;">
            <img src="img/luwu.png" style="height: 65px; width: auto; margin-right: 15px;">
            
            <div style="flex: 1; text-align: center; margin-left: -65px;">
                <h4 class="fw-bold m-0" style="letter-spacing: 1px; font-size: 16px;">PEMERINTAH KABUPATEN LUWU</h4>
                <h5 class="fw-bold m-0 mt-1" style="font-size: 13px;">PENJABARAN LAPORAN REALISASI ANGGARAN PENDAPATAN DAN BELANJA DAERAH</h5>
                <h6 class="fw-bold mt-1" style="font-size: 13px;">TAHUN ANGGARAN ${tahun}</h6>
            </div>
        </div>
        <div class="fw-bold mb-2" style="font-size: 11px; font-family: Arial, sans-serif;">
            <table style="width: 100%;">
                <tr><td style="width: 22%;">Urusan Pemerintahan</td><td>${urusan}</td></tr>
                <tr><td>Unit Organisasi</td><td>${orgOri}</td></tr>
            </table>
        </div>
        `;
    }

    div.innerHTML = `
        ${headerHTML} 
        <table class="table-lra">
            <colgroup>
                <col style="width: 18%;">
                <col style="width: 24%;">
                <col style="width: 11%;">
                <col style="width: 11%;">
                <col style="width: 11%;">
                <col style="width: 4%;"> 
                <col style="width: 25%;">
            </colgroup>
            <thead>
                <tr>
                    <th>KODE REKENING</th>
                    <th>URAIAN</th>
                    <th>ANGGARAN (Rp)</th>
                    <th>REALISASI (Rp)</th>
                    <th>BERTAMBAH/<br>(BERKURANG) (Rp)</th>
                    <th>(%)</th>
                    <th>PENJELASAN</th>
                </tr>
                <tr style="font-size: 9px; background-color: #fafafa;">
                    <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th>
                </tr>
            </thead>
            <tbody class="tbody-render"></tbody>
        </table>
        
        <div class="pdf-footer-pro" style="position: absolute; bottom: 10mm; left: 15mm; right: 5mm; display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; font-family: Arial, sans-serif; border-top: 2px solid #000; padding-top: 8px; color: #000; background: #fff;">
            <div>${periode} ${tahun}</div>
            <div class="text-uppercase">${skpdBersih}</div>
            <div>Halaman ${pageNum}</div>
        </div>
    `;
    return div;
}

window.addEventListener('afterprint', () => {
    document.querySelector('.container-fluid').style.display = 'block';
    document.querySelector('.print-page').style.display = 'block';
    let wrapper = document.getElementById('printWrapper');
    if(wrapper) { wrapper.style.display = 'none'; wrapper.innerHTML = ''; }
});

function exportToExcelRapi() {
    if(globalRawData.length === 0) { Swal.fire('Data Kosong', 'Upload file Excel SIPD terlebih dahulu.', 'warning'); return; }
    let wb = XLSX.utils.book_new();
    let excelData = [];
    excelData.push(["KODE REKENING", "URAIAN", "ANGGARAN (Rp)", "REALISASI (Rp)", "BERTAMBAH/(BERKURANG)", "%", "PENJELASAN SKPD"]);
    
    document.querySelectorAll('#containerRender tr').forEach(tr => {
        let cols = tr.querySelectorAll('td');
        if (cols.length < 7) return;
        let padLevel = parseInt(tr.dataset.pad) || 0;
        let kode = cols[0].innerText.trim();
        let uraian = cols[1].innerText.trim();
        let divPrint = tr.querySelector('.print-view-text');
        let penjelasan = divPrint ? divPrint.innerText.trim() : "";
        let spasi = "   ".repeat(padLevel); 
        excelData.push([ kode, spasi + uraian, cols[2].innerText.trim(), cols[3].innerText.trim(), cols[4].innerText.trim(), cols[5].innerText.trim(), penjelasan ]);
    });

    let ws = XLSX.utils.aoa_to_sheet(excelData);
    ws['!cols'] = [ {wch: 28}, {wch: 60}, {wch: 18}, {wch: 18}, {wch: 18}, {wch: 8}, {wch: 60} ];
    let skpdOri = document.getElementById('metaOrganisasi').innerText;
    let skpdBersih = skpdOri.split(' ').slice(1).join(' ').replace(/^[0-9\.\- ]+/g, '');
    XLSX.utils.book_append_sheet(wb, ws, "Penjabaran_LRA");
    XLSX.writeFile(wb, "LRA_" + (skpdBersih || "SKPD") + "_2026.xlsx");
}

// =========================================================================
// MESIN KOMUNIKASI SERVER (DENGAN DOUBLE-LOCK SECURITY + AUTO-RETRY)
// =========================================================================

// === HELPER: FETCH DENGAN AUTO-RETRY UNTUK STATUS "BUSY" ===
// Kalau server bilang "busy" (lock timeout), otomatis retry setelah delay.
// Maksimal retry 2x sebelum menyerah.
function fetchDenganRetry(url, options, retryCount = 0, maxRetry = 2) {
    return fetch(url, options)
        .then(r => r.json())
        .then(res => {
            // Kalau server bilang status "busy" dan masih ada retry
            if (res.status === 'busy' && res.retryable && retryCount < maxRetry) {
                let delaySec = res.retry_in_sec || 30;
                let delayMs = Math.min(delaySec * 1000, 30000); // maks 30 detik per retry
                
                Swal.update({
                    title: `Server sedang sibuk...`,
                    html: `<small>Mencoba ulang otomatis dalam ${Math.ceil(delayMs/1000)} detik...<br>(percobaan ${retryCount + 1} dari ${maxRetry})</small>`
                });

                return new Promise(resolve => {
                    setTimeout(() => {
                        resolve(fetchDenganRetry(url, options, retryCount + 1, maxRetry));
                    }, delayMs);
                });
            }
            return res;
        });
}

function simpanKeCloud() {
    // ??? SENSOR ANTI-BAJAKAN (DOMAIN LOCK)
    const DOMAIN_RESMI = "bkadakuntansiluwu.github.io"; 
    let currentDomain = window.location.hostname;
    
    if (currentDomain !== DOMAIN_RESMI && currentDomain !== "localhost" && currentDomain !== "127.0.0.1" && currentDomain !== "") {
        Swal.fire('Akses Ilegal ??', 'Aplikasi dijalankan dari server tidak resmi! Koneksi diblokir demi keamanan.', 'error');
        return; 
    }
    // ==========================================

    if(SCRIPT_URL_DATABASE.includes("ISI_DENGAN_URL")) { Swal.fire('Peringatan', 'URL Google Apps Script belum diset.', 'warning'); return; }
    if(!kodeSkpdAktif) { Swal.fire('Error', 'Harap upload LRA Excel terlebih dahulu!', 'warning'); return; }
    let tahun = document.getElementById('selectTahun').value;
    let dataPayload = [];
    
    // ?? HANYA SEDOT BARIS YANG PUNYA STEMPEL 'is-dirty' (YANG BARU DIEDIT OLEH USER INI)
    document.querySelectorAll('.input-database.is-dirty').forEach(inp => {
        dataPayload.push({ row_id: inp.getAttribute('data-rowid'), penjelasan: inp.value.trim() });
    });

    if(dataPayload.length === 0) { Swal.fire('Info', 'Belum ada draf baru yang diketik untuk disimpan.', 'info'); return; }
    Swal.fire({ title: 'Menyimpan Draf...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});

    // === IDENTITAS PENGGUNA UNTUK AUDIT LOG (P3) ===
    // Sekarang pakai getUserAgentLengkap() yang include nama user + browser info
    let identity = getUserAgentLengkap();

    let fetchOptions = {
        method: "POST", 
        body: JSON.stringify({ 
            secret_key: SECRET_KEY, 
            tahun: tahun, 
            kode_skpd: kodeSkpdAktif, 
            data: dataPayload,
            user_agent: identity
        })
    };

    fetchDenganRetry(SCRIPT_URL_DATABASE, fetchOptions)
        .then(res => {
            if(res.status === 'success') {
                // === TAMPILKAN STATISTIK DETAIL DARI SERVER BARU ===
                let stats = res.stats || {};
                let pesan = 'Data berhasil disinkronisasi ke server.';
                if (stats.updated || stats.inserted || stats.skipped_unchanged) {
                    pesan = `Sinkronisasi selesai:<br>
                        <small class="text-muted">
                            <i class="fa-solid fa-pen-to-square me-1"></i> Update: <b>${stats.updated || 0}</b> baris<br>
                            <i class="fa-solid fa-plus me-1"></i> Baru: <b>${stats.inserted || 0}</b> baris<br>
                            <i class="fa-solid fa-check me-1"></i> Tanpa perubahan: <b>${stats.skipped_unchanged || 0}</b> baris<br>
                            <i class="fa-solid fa-gauge-high me-1"></i> Sisa kuota simpan: <b>${stats.rate_limit_remaining || '?'}</b>/30
                        </small>`;
                }
                Swal.fire('Berhasil!', pesan, 'success');
                
                // ?? BERSIHKAN STEMPEL SETELAH BERHASIL SIMPAN AGAR TIDAK DIKIRIM ULANG
                document.querySelectorAll('.input-database.is-dirty').forEach(inp => {
                    inp.classList.remove('is-dirty');
                });
            }
            else if (res.status === 'busy') {
                // Sudah retry 2x masih busy → kasih pesan manual
                Swal.fire({
                    title: 'Server Sedang Sibuk',
                    html: `Server sedang memproses banyak request dari SKPD lain.<br><br>
                        <b>Saran:</b><br>
                        <small>
                        • Tunggu 1-2 menit, lalu klik Simpan Draft lagi<br>
                        • Atau gunakan <b>Backup Lokal</b> untuk simpan sementara<br>
                        • Data Anda tetap aman di layar browser
                        </small>`,
                    icon: 'warning',
                    confirmButtonText: 'OK, saya tunggu',
                    confirmButtonColor: '#f59e0b'
                });
            }
            else Swal.fire('Gagal', res.message || 'Terjadi kesalahan.', 'error');
        })
        .catch(() => Swal.fire('Error', 'Gagal terkoneksi. Cek koneksi internet Anda atau gunakan tombol backup paling bawah untuk menyimpan data ke drive lokal .', 'error'));
}

function muatDataDariCloud() {
    // 🛡️ SENSOR ANTI-BAJAKAN (DOMAIN LOCK)
    const DOMAIN_RESMI = "bkadakuntansiluwu.github.io"; 
    let currentDomain = window.location.hostname;
    
    if (currentDomain !== DOMAIN_RESMI && currentDomain !== "localhost" && currentDomain !== "127.0.0.1" && currentDomain !== "") {
        Swal.fire('Akses Ilegal 🚫', 'Aplikasi dijalankan dari server tidak resmi! Tarik data ditolak.', 'error');
        return; 
    }
    // ==========================================

    if(SCRIPT_URL_DATABASE.includes("ISI_DENGAN_URL")) { Swal.fire('Peringatan', 'URL Google Apps Script belum diset.', 'warning'); return; }
    if(!kodeSkpdAktif) { Swal.fire('Error', 'Harap upload LRA Excel terlebih dahulu!', 'warning'); return; }
    let tahun = document.getElementById('selectTahun').value;
    Swal.fire({ title: 'Menarik Draf...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});

    // INJEKSI KUNCI RAHASIA KE DALAM URL AGAR DIIZINKAN MASUK OLEH GOOGLE SCRIPT
    let fetchUrl = `${SCRIPT_URL_DATABASE}?action=load&tahun=${tahun}&kode_skpd=${kodeSkpdAktif}&secret_key=${SECRET_KEY}`;

    // doGet tidak butuh lock server, tapi tetap pakai retry untuk kasus cold-start
    fetchDenganRetry(fetchUrl, { method: "GET" })
        .then(res => {
            if(res.status === 'success') {
                let dataServer = res.data; let count = 0;
                document.querySelectorAll('.input-database').forEach(inp => {
                    let rowId = inp.getAttribute('data-rowid');
                    let realisasi = parseFloat(inp.getAttribute('data-realisasi'));
                    if(dataServer[rowId]) { 
                        inp.value = dataServer[rowId]; 
                        let printText = dataServer[rowId];
                        
                        // KECERDASAN MULTI-GRUP (TIDAK ADA YANG DIUBAH)
                        try { 
                            let parsed = JSON.parse(dataServer[rowId]);
                            let tempText = "";

                            if (Array.isArray(parsed) && parsed[0].items !== undefined) {
                                parsed.forEach(g => {
                                    if (g.sub) tempText += `${g.sub}\n\n`;
                                    if(g.items) {
                                        g.items.forEach(i => {
                                            let st = i.s ? ` ${i.s}` : '';
                                            tempText += `- ${i.u}\n<div style="border-bottom: 1px dashed #666; padding-bottom: 4px; margin-bottom: 4px;"><em>${i.v} ${st} x Rp ${i.h.toLocaleString('id-ID')} = Rp ${i.t.toLocaleString('id-ID')}</em></div>`;
                                        });
                                    }
                                    tempText += "\n";
                                });
                                printText = tempText.trim();
                            } 
                            else if (parsed && parsed.items) {
                                let headText = parsed.sub || parsed.judul || ""; 
                                if (headText) tempText += `${headText}\n\n`;
                                parsed.items.forEach(i => {
                                    let st = i.s ? ` ${i.s}` : '';
                                    tempText += `- ${i.u}\n<div style="border-bottom: 1px dashed #666; padding-bottom: 4px; margin-bottom: 4px;"><em>${i.v} ${st} x Rp ${i.h.toLocaleString('id-ID')} = Rp ${i.t.toLocaleString('id-ID')}</em></div>`;
                                });
                                printText = tempText;
                            } 
                            else if (parsed && parsed.mode === 'auto') {
                                printText = parsed.data.map(i => {
                                    let st = i.s ? ` ${i.s}` : '';
                                    return `- ${i.u}: ${i.v}${st} x Rp${i.h.toLocaleString('id-ID')} = Rp${i.t.toLocaleString('id-ID')}`;
                                }).join('\n');
                            } else if (parsed && parsed.mode === 'manual') {
                                printText = parsed.data;
                            }
                        } catch(e) {} 

                        document.getElementById('print_' + rowId).innerHTML = printText;
                        
                        let btn = document.getElementById('btn_' + rowId);
                        if (btn && btn.innerHTML.includes('Isi Keterangan')) {
                            btn.className = 'btn btn-sm w-100 text-start fw-bold';
                            btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #f8fafc; border: 1px solid #cbd5e1; color: #334155; border-radius: 4px;";
                            btn.innerHTML = '<i class="fa-solid fa-check text-muted me-1"></i> Keterangan Disimpan';
                        } else {
                            perbaruiTombolStatus(rowId, printText, realisasi);
                        }
                        count++; 
                    }
                });
                Swal.fire('Sukses!', `${count} draf baris berhasil dipulihkan.<br><small class="text-muted">Sumber: ${res.source === 'cache' ? 'Cache Server (cepat)' : 'Database Fresh'}</small>`, 'success');
            } 
            else if (res.status === 'busy') {
                Swal.fire({
                    title: 'Server Sedang Sibuk',
                    html: `Server sedang memproses banyak request dari SKPD lain.<br><br>
                        <b>Saran:</b> Tunggu 1-2 menit lalu klik <b>Tarik Data</b> lagi.`,
                    icon: 'warning',
                    confirmButtonText: 'OK, saya tunggu',
                    confirmButtonColor: '#f59e0b'
                });
            }
            else if (res.status === 'error') {
                Swal.fire('Akses Ditolak', res.message, 'error');
            }
            else Swal.fire('Info', 'Tidak ada data draf di server.', 'info');
        }).catch(() => Swal.fire('Error', 'Gagal terkoneksi ke server.', 'error'));
}

window.addEventListener('beforeunload', function (e) {
    e.preventDefault(); e.returnValue = ''; 
});

// ====================================================================
// MESIN FILTER AI & REKALKULASI TOTAL DINAMIS (KELAS ENTERPRISE)
// ====================================================================
function terapkanFilterBelanja() {
    let selectObj = document.getElementById('selectFilterBelanja');
    if (!selectObj) return; 
    let filter = selectObj.value;
    let tbody = document.getElementById('containerRender');
    
    // Hapus Baris Total Dinamis Lama (Jika ada dari filter sebelumnya)
    let oldTotalRow = document.getElementById('rowDynamicTotal');
    if (oldTotalRow) oldTotalRow.remove();

    let rows = Array.from(document.querySelectorAll('#containerRender tr'));

    // TAHAP 1: Sortir Kategori Dasar (Logika Universal Cerdas)
    rows.forEach(tr => {
        let kat = tr.dataset.kategori;
        tr.style.display = ''; // Munculkan semua defaultnya

        if (filter !== 'semua') {
            if (kat !== 'induk' && kat !== filter) {
                tr.style.display = 'none';
            }
        }
    });

    // TAHAP 2: Pembersih Judul Program Kosong 
    if (filter !== 'semua') {
        for (let i = rows.length - 1; i >= 0; i--) {
            let tr = rows[i];
            if (tr.dataset.kategori === 'induk') {
                let padLvl = parseInt(tr.dataset.pad) || 0;
                let hasVisibleChild = false;
                for (let j = i + 1; j < rows.length; j++) {
                    let childTr = rows[j];
                    let childPad = parseInt(childTr.dataset.pad) || 0;
                    if (childPad <= padLvl) break; 
                    if (childTr.style.display !== 'none') {
                        hasVisibleChild = true;
                        break;
                    }
                }
                if (!hasVisibleChild) tr.style.display = 'none';
            }
        }
    }

    // TAHAP 3: REKALKULASI TOTAL NILAI INDUK & GRAND TOTAL
    let grandAng = 0; let grandRea = 0; // Memori untuk Baris Total Bawah

    if (filter === 'semua') {
        // Jika kembali ke "Semua Rincian", pulihkan nilai asli dari memori
        rows.forEach(tr => {
            let tdAng = tr.children[2]; let tdRea = tr.children[3];
            let tdSel = tr.children[4]; let tdPer = tr.children[5];
            if(tdAng && tr.dataset.oriAngStr !== undefined) tdAng.innerText = tr.dataset.oriAngStr;
            if(tdRea && tr.dataset.oriReaStr !== undefined) tdRea.innerText = tr.dataset.oriReaStr;
            if(tdSel && tr.dataset.oriSelStr !== undefined) tdSel.innerText = tr.dataset.oriSelStr;
            if(tdPer && tr.dataset.oriPerStr !== undefined) tdPer.innerText = tr.dataset.oriPerStr;
        });
    } else {
        // Jika sedang difilter, HITUNG ULANG total secara instan
        rows.forEach((tr, i) => {
            if (tr.style.display === 'none') return; 
            
            if (tr.dataset.kategori === 'induk') {
                let textUraianLcase = tr.children[1].innerText.toLowerCase();
                let isGrandTotal = textUraianLcase.includes('jumlah') || textUraianLcase === 'total' || textUraianLcase.includes('surplus') || textUraianLcase.includes('defisit');
                
                let padLvl = parseInt(tr.dataset.pad) || 0;
                let sumAng = 0; let sumRea = 0;

                if (isGrandTotal) {
                                        
                    tr.style.display = 'none'; 
                } else {
                    // Menjumlahkan rincian untuk Induk Program/Kegiatan (Di Atas)
                    for (let j = i + 1; j < rows.length; j++) {
                        let childTr = rows[j];
                        let childPad = parseInt(childTr.dataset.pad) || 0;
                        if (childPad <= padLvl) break; 
                        if (childTr.style.display !== 'none' && childTr.dataset.kategori !== 'induk') {
                            sumAng += parseFloat(childTr.dataset.oriAng) || 0;
                            sumRea += parseFloat(childTr.dataset.oriRea) || 0;
                        }
                    }

                    // Format angka Induk
                    let selisih = sumRea - sumAng;
                    let persentase = sumAng > 0 ? ((sumRea / sumAng) * 100).toFixed(2) : '0,00';
                    let formatRp = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
                    
                    let strAng = sumAng !== 0 ? sumAng.toLocaleString('id-ID', formatRp) : '0,00';
                    let strRea = sumRea !== 0 ? sumRea.toLocaleString('id-ID', formatRp) : '0,00';
                    let strSel = selisih !== 0 ? (selisih < 0 ? '(' + Math.abs(selisih).toLocaleString('id-ID', formatRp) + ')' : selisih.toLocaleString('id-ID', formatRp)) : '0,00';
                    let strPer = persentase.replace('.', ',');

                    if (tr.dataset.oriAngStr === '') { strAng = ''; strRea = ''; strSel = ''; strPer = ''; }

                    let tdAng = tr.children[2]; let tdRea = tr.children[3];
                    let tdSel = tr.children[4]; let tdPer = tr.children[5];
                    if(tdAng) tdAng.innerText = strAng;
                    if(tdRea) tdRea.innerText = strRea;
                    if(tdSel) tdSel.innerText = strSel;
                    if(tdPer) tdPer.innerText = strPer;
                }
            } else if (tr.dataset.kategori === filter) {
                // Sambil jalan, mesin menangkap nilai total khusus untuk baris paling bawah
                grandAng += parseFloat(tr.dataset.oriAng) || 0;
                grandRea += parseFloat(tr.dataset.oriRea) || 0;
            }
        });
    }

// TAHAP 4: INJEKSI BARIS TOTAL DINAMIS KE PALING BAWAH TABEL (SUPER CERDAS)
    if (filter !== 'semua') {
        let namaFilter = "KESELURUHAN";
        if (filter === 'operasi') namaFilter = "BELANJA OPERASI";
        else if (filter === 'modal') namaFilter = "BELANJA MODAL";
        else if (filter === 'btt') namaFilter = "BELANJA TAK TERDUGA";
        else if (filter === 'transfer') namaFilter = "BELANJA TRANSFER";

        let grandSel = grandRea - grandAng;
        let grandPer = grandAng > 0 ? ((grandRea / grandAng) * 100).toFixed(2).replace('.', ',') : '0,00';
        let formatRp = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
        
        let trTotal = document.createElement('tr');
        trTotal.id = 'rowDynamicTotal';
        trTotal.className = 'pad-lvl-1 style-bold';
        
        // CSS Profesional & Elegan (Standar Dokumen Keuangan Negara)
        trTotal.style.backgroundColor = '#f8fafc'; // Abu-abu sangat muda (seperti header asli)
        trTotal.style.borderTop = '2px solid #000'; // Garis hitam solid tegas
        trTotal.style.borderBottom = '2px solid #000';
        trTotal.dataset.pad = 1;

        // Struktur Kolom (Hitam murni, bold, rapi tanpa icon norak)
        trTotal.innerHTML = `
            <td></td>
            <td class="uraian-cell text-center text-uppercase text-dark" style="font-size: 12px; font-weight: 800; letter-spacing: 0.5px;">Jumlah</td>
            <td class="text-end text-dark" style="font-weight: 800;">${grandAng !== 0 ? grandAng.toLocaleString('id-ID', formatRp) : '0,00'}</td>
            <td class="text-end text-dark" style="font-weight: 800;">${grandRea !== 0 ? grandRea.toLocaleString('id-ID', formatRp) : '0,00'}</td>
            <td class="text-end text-dark" style="font-weight: 800;">${grandSel !== 0 ? (grandSel < 0 ? '(' + Math.abs(grandSel).toLocaleString('id-ID', formatRp) + ')' : grandSel.toLocaleString('id-ID', formatRp)) : '0,00'}</td>
            <td class="text-center text-dark" style="font-weight: 800;">${grandPer}</td>
            <td></td>
        `;
        
        // Letakkan baris ini di posisi paling ujung bawah!
        tbody.appendChild(trTotal);
    }
}

// ====================================================================
// MESIN DETEKTOR KEBOHONGAN (LAPIS 1: ANTI-NGASAL & LAPIS 2: PANJANG)
// ====================================================================
function cekKualitasTeks(teks) {
    let bersih = teks.replace(/<[^>]*>?/gm, '').trim(); // Hapus kode HTML
    let hurufSaja = bersih.replace(/[^a-zA-Z]/g, '');
    
    if (hurufSaja.length < 15) return "Teks Terlalu Singkat (Min 15 Huruf)";
    if (/(.)\1{4,}/.test(bersih.toLowerCase())) return "Terdeteksi Ketikan Ngawur (Karakter Berulang)"; // Contoh: aaaaa
    if (/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(bersih)) return "Terdeteksi Ketikan Ngawur (Konsonan Beruntun)"; // Contoh: mnprst
    if (/\b[a-zA-Z]{25,}\b/.test(bersih)) return "Terdeteksi Ketikan Ngawur (Kata Terlalu Panjang)"; // Contoh: asdasdasdasdasd
    
    return "OK";
}

// =========================================================================
// MESIN SEKOCI PENYELAMAT: BACKUP & RESTORE DARURAT (OFFLINE)
// =========================================================================

function backupDaruratOffline() {
    if(!kodeSkpdAktif) { Swal.fire('Error', 'Harap upload LRA Excel terlebih dahulu!', 'warning'); return; }
    
    let tahun = document.getElementById('selectTahun').value;
    let dataPayload = {};
    let count = 0;
    
    // Sedot semua ketikan dari layar secara diam-diam
    document.querySelectorAll('.input-database').forEach(inp => {
        if(inp.value.trim() !== '') {
            dataPayload[inp.getAttribute('data-rowid')] = inp.value.trim();
            count++;
        }
    });

    if(count === 0) { Swal.fire('Info', 'Belum ada data rincian yang diketik untuk di-backup.', 'info'); return; }

    // Membungkus data dengan stempel resmi LRA LUWU
    let backupData = {
        app: "LRA_LUWU",
        tahun: tahun,
        kode_skpd: kodeSkpdAktif,
        timestamp: new Date().toISOString(),
        data: dataPayload
    };

    // Proses Download File Otomatis
    let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
    let downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    
    // Nama file dibuat cerdas agar tidak tertukar
    let namaFile = `Backup_LRA_LUWU_${tahun}_${kodeSkpdAktif.replace(/\./g, '')}.json`;
    downloadAnchorNode.setAttribute("download", namaFile);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    
    Swal.fire('Berhasil', `File Backup Darurat berhasil diunduh (${count} rincian).<br><br><b>PENTING:</b> File ini digunakan saat internet mati. Simpan baik-baik!`, 'success');
}

function prosesRestoreOffline(event) {
    const file = event.target.files[0];
    if (!file) return;

    if(!kodeSkpdAktif) { 
        Swal.fire('Error', 'Harap upload LRA Excel dari SIPD terlebih dahulu di layar utama sebelum melakukan Restore!', 'warning'); 
        event.target.value = ''; // reset file
        return; 
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let parsedData = JSON.parse(e.target.result);
            
            // ??? SENSOR 1: Pastikan ini benar-benar file dari Aplikasi kita
            if(parsedData.app !== "LRA_LUWU") {
                Swal.fire('File Ditolak', 'Ini bukan file backup resmi dari Aplikasi LRA Luwu.', 'error');
                return;
            }
            
            let tahunAktif = document.getElementById('selectTahun').value;
            let isWarning = false;
            let warningMsg = "";
            
            // ??? SENSOR 2: Cek Silang Tahun & SKPD (Anti-Tertukar)
            if(parsedData.tahun !== tahunAktif) { isWarning = true; warningMsg += `<br>- Tahun file (${parsedData.tahun}) beda dengan tahun aktif (${tahunAktif})`; }
            if(parsedData.kode_skpd !== kodeSkpdAktif) { isWarning = true; warningMsg += `<br>- Kode SKPD milik dinas lain`; }
            
            if(isWarning) {
                Swal.fire({
                    title: 'Peringatan Data Tidak Cocok!',
                    html: `File backup ini memiliki ketidaksesuaian:${warningMsg}<br><br>Apakah Anda yakin ingin memaksakan restore? Data baris yang tidak cocok akan diabaikan oleh sistem.`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6',
                    confirmButtonText: 'Ya, Paksa Restore'
                }).then((result) => {
                    if (result.isConfirmed) eksekusiRestoreLokal(parsedData.data);
                });
            } else {
                eksekusiRestoreLokal(parsedData.data);
            }
            
        } catch (err) {
            Swal.fire('Error', 'File backup rusak atau gagal dibaca.', 'error');
        }
        event.target.value = ''; // reset input agar bisa milih file yang sama lagi jika perlu
    };
    reader.readAsText(file);
}

// LOGIKA RENDER (Di-copy 100% identik dari logika muatDataDariCloud agar akurasinya mutlak)
function eksekusiRestoreLokal(dataServer) {
    let count = 0;
    Swal.fire({ title: 'Merestore Data...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
    
    setTimeout(() => {
        document.querySelectorAll('.input-database').forEach(inp => {
            let rowId = inp.getAttribute('data-rowid');
            let realisasi = parseFloat(inp.getAttribute('data-realisasi'));
            
            if(dataServer[rowId]) { 
                inp.value = dataServer[rowId]; 
                                inp.classList.add('is-dirty');
                let printText = dataServer[rowId];
                
                try { 
                    let parsed = JSON.parse(dataServer[rowId]);
                    let tempText = "";

                    if (Array.isArray(parsed) && parsed[0].items !== undefined) {
                        parsed.forEach(g => {
                            if (g.sub) tempText += `${g.sub}\n\n`;
                            if(g.items) {
                                g.items.forEach(i => {
                                    let st = i.s ? ` ${i.s}` : '';
                                    tempText += `- ${i.u}\n<div style="border-bottom: 1px dashed #666; padding-bottom: 4px; margin-bottom: 4px;"><em>${i.v} ${st} x Rp ${i.h.toLocaleString('id-ID')} = Rp ${i.t.toLocaleString('id-ID')}</em></div>`;
                                });
                            }
                            tempText += "\n";
                        });
                        printText = tempText.trim();
                    } 
                    else if (parsed && parsed.items) {
                        let headText = parsed.sub || parsed.judul || ""; 
                        if (headText) tempText += `${headText}\n\n`;
                        parsed.items.forEach(i => {
                            let st = i.s ? ` ${i.s}` : '';
                            tempText += `- ${i.u}\n<div style="border-bottom: 1px dashed #666; padding-bottom: 4px; margin-bottom: 4px;"><em>${i.v} ${st} x Rp ${i.h.toLocaleString('id-ID')} = Rp ${i.t.toLocaleString('id-ID')}</em></div>`;
                        });
                        printText = tempText;
                    } 
                    else if (parsed && parsed.mode === 'auto') {
                        printText = parsed.data.map(i => {
                            let st = i.s ? ` ${i.s}` : '';
                            return `- ${i.u}: ${i.v}${st} x Rp${i.h.toLocaleString('id-ID')} = Rp${i.t.toLocaleString('id-ID')}`;
                        }).join('\n');
                    } else if (parsed && parsed.mode === 'manual') {
                        printText = parsed.data;
                    }
                } catch(e) {} 

                document.getElementById('print_' + rowId).innerHTML = printText;
                
                let btn = document.getElementById('btn_' + rowId);
                if (btn && btn.innerHTML.includes('Isi Keterangan')) {
                    btn.className = 'btn btn-sm w-100 text-start fw-bold';
                    btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #f8fafc; border: 1px solid #cbd5e1; color: #334155; border-radius: 4px;";
                    btn.innerHTML = '<i class="fa-solid fa-check text-muted me-1"></i> Keterangan Disimpan';
                } else {
                    perbaruiTombolStatus(rowId, printText, realisasi);
                }
                count++; 
            }
        });
        
        Swal.fire('Restore Berhasil!', `${count} baris data berhasil dikembalikan dari file Backup Lokal Anda.`, 'success');
    }, 600);
}