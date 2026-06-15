const SCRIPT_URL_DATABASE = "https://script.google.com/macros/s/AKfycbyjXx_GY6R47ZZ6Yj9CNIywgK5PvFh50a0vlXWNBw4-ePHAyw_crZJPKnj3pZu3AHM8vg/exec";

let globalRawData = [];
let kodeSkpdAktif = ""; 
let modalAsisten;
let modalKeterangan;

document.addEventListener("DOMContentLoaded", function() {
    modalAsisten = new bootstrap.Modal(document.getElementById('modalPenjelasan'));
    modalKeterangan = new bootstrap.Modal(document.getElementById('modalKeterangan'));
    
    isiDropdownTahunOtomatis();
    
    // SENSOR AUTO-SAVE TANDA TANGAN
    document.getElementById('ttd-jabatan').addEventListener('input', function() { 
        if(kodeSkpdAktif) localStorage.setItem('TTD_JAB_' + kodeSkpdAktif, this.innerText); 
    });
    document.getElementById('ttd-nama').addEventListener('input', function() { 
        if(kodeSkpdAktif) localStorage.setItem('TTD_NAMA_' + kodeSkpdAktif, this.innerText); 
    });
    document.getElementById('ttd-nip').addEventListener('input', function() { 
        if(kodeSkpdAktif) localStorage.setItem('TTD_NIP_' + kodeSkpdAktif, this.innerText); 
    });
});

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

// SENSOR KALENDER TANDA TANGAN
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
    let jab = localStorage.getItem('TTD_JAB_' + kodeSkpdAktif);
    let nma = localStorage.getItem('TTD_NAMA_' + kodeSkpdAktif);
    let nip = localStorage.getItem('TTD_NIP_' + kodeSkpdAktif);

    if(jab) document.getElementById('ttd-jabatan').innerText = jab;
    if(nma) document.getElementById('ttd-nama').innerText = nma;
    if(nip) document.getElementById('ttd-nip').innerText = nip;
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
    
    // Set dasar class tombol agar seragam
    btn.className = 'btn btn-sm w-100 text-start';

    if (printText.trim() === '') {
        btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #ffffff; border: 1px solid #cbd5e1; color: #475569; border-radius: 4px;";
        btn.innerHTML = '<i class="fa-regular fa-pen-to-square text-secondary me-1"></i> Isi Penjelasan';
    } else if (realisasi === 0 && printText.trim() !== '') {
        btn.className = 'btn btn-sm w-100 text-start fw-bold';
        btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #f8fafc; border: 1px solid #cbd5e1; color: #334155; border-radius: 4px;";
        btn.innerHTML = '<i class="fa-solid fa-check text-muted me-1"></i> Catatan Tersimpan';
    } else if (Math.abs(selisih) < 1) { 
        // Hijau Pastel Sangat Lembut & Bersih (Sesuai)
        btn.className = 'btn btn-sm w-100 text-start fw-bold';
        btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 4px;";
        btn.innerHTML = '<i class="fa-solid fa-circle-check text-success me-1"></i> Sesuai / Balance';
    } else if (selisih < 0) { 
        // Kuning-Orange Tingkat Rendah (Kurang Dana)
        let fKurang = Math.abs(selisih).toLocaleString('id-ID', formatRp);
        btn.className = 'btn btn-sm w-100 text-start fw-bold';
        btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #fffde7; border: 1px solid #fef08a; color: #854d0e; border-radius: 4px;";
        btn.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-warning me-1"></i> Kurang Rp ${fKurang}`;
    } else { 
        // Merah Lembut / Soft Rose (Kelebihan Dana)
        let fLebih = selisih.toLocaleString('id-ID', formatRp);
        btn.className = 'btn btn-sm w-100 text-start fw-bold';
        btn.style.cssText = "font-family:Arial; font-size:11px; padding: 4px 8px; background-color: #fef2f2; border: 1px solid #fecdd3; color: #991b1b; border-radius: 4px;";
        btn.innerHTML = `<i class="fa-solid fa-circle-xmark text-danger me-1"></i> Lebih Rp ${fLebih}`;
    }
}

function setMode() {
    setTimeout(() => { kalkulasiKombinasi(); }, 100); 
}

function tambahBaris(ur = "", v = "", s = "", h = "") {
    let container = document.getElementById('dynamicRows');
    let div = document.createElement('div');
    div.className = "row mb-2 align-items-start"; 
    let hFormatted = h ? h.toLocaleString('id-ID') : "";

    div.innerHTML = `
        <div class="col-4"><textarea class="form-control form-control-sm uraian" rows="2" placeholder="Uraian (Cth: ATK)" style="resize:none;">${ur}</textarea></div>
        <div class="col-2"><input type="number" class="form-control form-control-sm vol" placeholder="Vol" oninput="kalkulasiKombinasi()" value="${v}"></div>
        <div class="col-2"><input type="text" class="form-control form-control-sm satuan" placeholder="Satuan" value="${s}"></div>
        <div class="col-3"><input type="text" class="form-control form-control-sm harga" placeholder="Harga (Rp)" oninput="formatRibuan(this); kalkulasiKombinasi()" value="${hFormatted}"></div>
        <div class="col-1 text-end align-self-center">
            <div class="fw-bold subtotal-txt mb-1" style="font-size: 11px; color: #16a34a;">0</div>
            <button class="btn btn-sm btn-outline-danger" onclick="this.parentElement.parentElement.remove(); kalkulasiKombinasi();"><i class="fa-solid fa-trash"></i></button>
        </div>
    `;
    container.appendChild(div);
    kalkulasiKombinasi();
}

function bukaAsisten(rowID, kodeRek, uraian, realisasi) {
    let nilaiLama = document.getElementById('val_' + rowID).value;
    document.getElementById('modalTargetRow').value = rowID;
    document.getElementById('modalTargetRealisasi').value = realisasi;
    
    let judulRekening = kodeRek ? `${kodeRek} - ${uraian}` : uraian;
    document.getElementById('modalUraian').innerText = judulRekening;
    document.getElementById('modalRealisasiTxt').innerText = "Rp " + realisasi.toLocaleString('id-ID');
    
    let isAuto = false; let parsedData = [];
    if (nilaiLama && nilaiLama.trim() !== "") {
        try { 
            let parsed = JSON.parse(nilaiLama); 
            if (Array.isArray(parsed)) { isAuto = true; parsedData = parsed; }
            else if (parsed.mode) { isAuto = (parsed.mode === 'auto'); parsedData = parsed.data; }
        } catch(e) { isAuto = false; parsedData = nilaiLama; }
    }

    if (isAuto) {
        document.getElementById('tab-otomatis').click();
        document.getElementById('dynamicRows').innerHTML = '';
        if (!Array.isArray(parsedData) || parsedData.length === 0) tambahBaris();
        else parsedData.forEach(item => tambahBaris(item.u, item.v, item.s, item.h));
        document.getElementById('modalTextarea').value = "";
    } else {
        document.getElementById('tab-manual').click();
        document.getElementById('modalTextarea').value = Array.isArray(parsedData) ? "" : parsedData;
        document.getElementById('dynamicRows').innerHTML = '';
        tambahBaris(); 
    }
    
    kalkulasiKombinasi();
    modalAsisten.show();
}

function kalkulasiKombinasi() {
    let activeTab = document.querySelector('#modeTabs .nav-link.active').id;
    let realisasi = parseFloat(document.getElementById('modalTargetRealisasi').value);
    let totalHitung = 0;
    let isKosong = false;

    if (activeTab === 'tab-otomatis') {
        let rows = document.querySelectorAll('#dynamicRows .row');
        isKosong = (rows.length === 0);
        rows.forEach(row => {
            let v = parseFloat(row.querySelector('.vol').value) || 0;
            let hStr = row.querySelector('.harga').value.replace(/\./g, '').replace(/,/g, '.');
            let h = parseFloat(hStr) || 0;
            let sub = v * h;
            row.querySelector('.subtotal-txt').innerText = sub.toLocaleString('id-ID');
            totalHitung += sub;
        });
    } else {
        let teks = document.getElementById('modalTextarea').value;
        totalHitung = hitungTotalDariTeks(teks);
        isKosong = (teks.trim() === '');
    }

    let alertBox = document.getElementById('alertSmart');
    let icon = document.getElementById('iconSmart');
    let title = document.getElementById('titleSmart');
    let desc = document.getElementById('descSmart');
    let selisih = totalHitung - realisasi;

    if (isKosong) {
        alertBox.className = 'alert alert-pro alert-pro-info d-flex align-items-center mb-0';
        icon.className = 'fa-solid fa-pen-to-square fs-3 me-3 text-secondary';
        title.innerText = 'Menunggu Inputan';
        desc.innerText = activeTab === 'tab-otomatis' ? 'Isi form di bawah, sistem akan menghitung otomatis.' : 'Ketik narasi perhitungan Anda di kotak bawah ini.';
    } else if (realisasi === 0) {
        alertBox.className = 'alert alert-pro alert-pro-info d-flex align-items-center mb-0';
        icon.className = 'fa-solid fa-info-circle fs-3 me-3 text-info';
        title.innerText = 'Teks Disimpan';
        desc.innerText = 'Nilai realisasi kosong, catatan akan dilampirkan sebagai penjelas.';
    } else if (Math.abs(selisih) < 1) {
        alertBox.className = 'alert alert-pro alert-pro-success d-flex align-items-center mb-0';
        icon.className = 'fa-solid fa-check-circle fs-3 me-3 text-success';
        title.innerText = 'SEMPURNA! SUDAH BALANCE';
        desc.innerText = `Total perhitungan Rp${totalHitung.toLocaleString('id-ID')} cocok dengan nilai Realisasi SIPD.`;
    } else if (selisih < 0) {
        alertBox.className = 'alert alert-pro alert-pro-warning d-flex align-items-center mb-0';
        icon.className = 'fa-solid fa-triangle-exclamation fs-3 me-3 text-warning';
        title.innerText = 'NILAI MASIH KURANG';
        desc.innerHTML = `Total perhitungan Anda baru <b>Rp${totalHitung.toLocaleString('id-ID')}</b>.<br>Masih kurang <b>Rp${Math.abs(selisih).toLocaleString('id-ID')}</b> dari SIPD.`;
    } else {
        alertBox.className = 'alert alert-pro alert-pro-danger d-flex align-items-center mb-0';
        icon.className = 'fa-solid fa-circle-xmark fs-3 me-3 text-danger';
        title.innerText = 'KELEBIHAN DANA';
        desc.innerHTML = `Total perhitungan Anda <b>Rp${totalHitung.toLocaleString('id-ID')}</b>.<br>Melebihi SIPD sebesar <b>Rp${selisih.toLocaleString('id-ID')}</b>. Periksa angka Anda!`;
    }
}

function simpanDariModal() {
    let rowID = document.getElementById('modalTargetRow').value;
    let realisasi = parseFloat(document.getElementById('modalTargetRealisasi').value);
    let activeTab = document.querySelector('#modeTabs .nav-link.active').id;
    
    let valToSave = "";
    let textToPrint = "";
    let modeStr = (activeTab === 'tab-otomatis') ? 'auto' : 'manual';

    if (modeStr === 'auto') {
        let dataJSON = [];
        document.querySelectorAll('#dynamicRows .row').forEach(row => {
            let ur = row.querySelector('.uraian').value;
            let v = parseFloat(row.querySelector('.vol').value) || 0;
            let s = row.querySelector('.satuan').value;
            let hStr = row.querySelector('.harga').value.replace(/\./g, '').replace(/,/g, '.');
            let h = parseFloat(hStr) || 0;
            let t = v * h;
            if (ur || v > 0 || h > 0) {
                dataJSON.push({u: ur, v: v, s: s, h: h, t: t});
                let st = s ? ` ${s}` : '';
                textToPrint += `- ${ur}: ${v}${st} x Rp${h.toLocaleString('id-ID')} = Rp${t.toLocaleString('id-ID')}\n`;
            }
        });
        valToSave = JSON.stringify({ mode: modeStr, data: dataJSON });
    } else {
        let manualText = document.getElementById('modalTextarea').value;
        textToPrint = manualText;
        valToSave = JSON.stringify({ mode: modeStr, data: manualText });
    }
    
    document.getElementById('val_' + rowID).value = valToSave;
    document.getElementById('print_' + rowID).innerText = textToPrint;
    
    perbaruiTombolStatus(rowID, textToPrint, realisasi);
    modalAsisten.hide();
}

function cetakPro() {
    let tbodyLama = document.getElementById('containerRender');
    if(tbodyLama.children.length === 0 || tbodyLama.innerText.includes('Menunggu')) {
        Swal.fire('Data Kosong', 'Upload Excel LRA Per Pogram dari SIPD terlebih dahulu.', 'warning');
        return;
    }

    Swal.fire({ title: 'Tunggu Sebentar Yah...', text: 'Sedang Memproses Halaman...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});

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

        rows.forEach(row => {
            let clone = row.cloneNode(true);
            currentTbody.appendChild(clone);

            let tableRect = currentTbody.getBoundingClientRect();
            let footerRect = currentFooter.getBoundingClientRect();

            if (tableRect.bottom > (footerRect.top - 10)) {
                currentTbody.removeChild(clone); 
                
                pageNum++;
                currentPage = createPageTemplate(pageNum, false);
                wrapper.appendChild(currentPage);
                
                currentTbody = currentPage.querySelector('.tbody-render');
                currentFooter = currentPage.querySelector('.pdf-footer-pro');
                
                currentTbody.appendChild(clone); 
            }
        });

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
        
        if (ttdRect.bottom > (currentFooter.getBoundingClientRect().top - 10)) {
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

function simpanKeCloud() {
    if(SCRIPT_URL_DATABASE.includes("ISI_DENGAN_URL")) { Swal.fire('Peringatan', 'URL Google Apps Script belum diset.', 'warning'); return; }
    if(!kodeSkpdAktif) { Swal.fire('Error', 'Harap upload LRA Excel terlebih dahulu!', 'warning'); return; }
    let tahun = document.getElementById('selectTahun').value;
    let dataPayload = [];
    
    document.querySelectorAll('.input-database').forEach(inp => {
        if(inp.value.trim() !== '') dataPayload.push({ row_id: inp.getAttribute('data-rowid'), penjelasan: inp.value.trim() });
    });

    if(dataPayload.length === 0) { Swal.fire('Info', 'Belum ada draf yang diketik.', 'info'); return; }
    Swal.fire({ title: 'Menyimpan Draf...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});

    fetch(SCRIPT_URL_DATABASE + "?action=save", {
        method: "POST", body: JSON.stringify({ tahun: tahun, kode_skpd: kodeSkpdAktif, data: dataPayload })
    }).then(r => r.json()).then(res => {
        if(res.status === 'success') Swal.fire('Berhasil!', 'Draf tersimpan di Server Kabupaten.', 'success');
        else Swal.fire('Gagal', 'Terjadi kesalahan.', 'error');
    }).catch(() => Swal.fire('Error', 'Gagal server.', 'error'));
}

function muatDataDariCloud() {
    if(SCRIPT_URL_DATABASE.includes("ISI_DENGAN_URL")) { Swal.fire('Peringatan', 'URL Google Apps Script belum diset.', 'warning'); return; }
    if(!kodeSkpdAktif) { Swal.fire('Error', 'Harap upload LRA Excel terlebih dahulu!', 'warning'); return; }
    let tahun = document.getElementById('selectTahun').value;
    Swal.fire({ title: 'Menarik Draf...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});

    fetch(`${SCRIPT_URL_DATABASE}?action=load&tahun=${tahun}&kode_skpd=${kodeSkpdAktif}`)
        .then(r => r.json()).then(res => {
            if(res.status === 'success') {
                let dataServer = res.data; let count = 0;
                document.querySelectorAll('.input-database').forEach(inp => {
                    let rowId = inp.getAttribute('data-rowid');
                    let realisasi = parseFloat(inp.getAttribute('data-realisasi'));
                    if(dataServer[rowId]) { 
                        inp.value = dataServer[rowId]; 
                        let printText = dataServer[rowId];
                        
                        try { 
                            let parsed = JSON.parse(dataServer[rowId]);
                            if (parsed && parsed.mode === 'auto') {
                                printText = parsed.data.map(i => {
                                    let st = i.s ? ` ${i.s}` : '';
                                    return `- ${i.u}: ${i.v}${st} x Rp${i.h.toLocaleString('id-ID')} = Rp${i.t.toLocaleString('id-ID')}`;
                                }).join('\n');
                            } else if (parsed && parsed.mode === 'manual') {
                                printText = parsed.data;
                            }
                        } catch(e) {} 

                        document.getElementById('print_' + rowId).innerText = printText;
                        
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
                Swal.fire('Sukses!', `${count} draf baris berhasil dipulihkan.`, 'success');
            } else Swal.fire('Info', 'Tidak ada data draf di server.', 'info');
        }).catch(() => Swal.fire('Error', 'Gagal server.', 'error'));
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
