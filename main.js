const fpu = new FloatingPointCoprocessor();
const cpu = new Intel8080(fpu);
const assembler = new Assembler8080();

let runInterval = null;
let memoryStart = 0;

const FPU_DEMO_PROGRAM = `; Demostracion del coprocesador Float32
; F0 = 1.5 (IEEE 754: 3FC00000)
MVI A, 00H
OUT 10H
OUT 11H
MVI A, C0H
OUT 12H
MVI A, 3FH
OUT 13H

; F1 = 2.25 (IEEE 754: 40100000)
MVI A, 00H
OUT 14H
OUT 15H
MVI A, 10H
OUT 16H
MVI A, 40H
OUT 17H

; Comando 01H = SUMA
MVI A, 01H
OUT 18H

; Leer resultado 3.75 (40700000) y guardarlo
IN 20H
STA 2000H
IN 21H
STA 2001H
IN 22H
STA 2002H
IN 23H
STA 2003H

; Leer estado (01H = READY)
IN 24H
STA 2004H
HLT`;

function updateUI() {
    // Registers
    document.getElementById('reg-a').textContent = cpu.registers.a.toString(16).toUpperCase().padStart(2, '0');
    document.getElementById('reg-b').textContent = cpu.registers.b.toString(16).toUpperCase().padStart(2, '0');
    document.getElementById('reg-c').textContent = cpu.registers.c.toString(16).toUpperCase().padStart(2, '0');
    document.getElementById('reg-d').textContent = cpu.registers.d.toString(16).toUpperCase().padStart(2, '0');
    document.getElementById('reg-e').textContent = cpu.registers.e.toString(16).toUpperCase().padStart(2, '0');
    document.getElementById('reg-h').textContent = cpu.registers.h.toString(16).toUpperCase().padStart(2, '0');
    document.getElementById('reg-l').textContent = cpu.registers.l.toString(16).toUpperCase().padStart(2, '0');
    document.getElementById('reg-pc').textContent = cpu.registers.pc.toString(16).toUpperCase().padStart(4, '0');
    document.getElementById('reg-sp').textContent = cpu.registers.sp.toString(16).toUpperCase().padStart(4, '0');
    document.getElementById('reg-f').textContent = cpu.getFlagByte().toString(16).toUpperCase().padStart(2, '0');

    // Flags
    document.getElementById('flag-s').textContent = cpu.flags.s ? '1' : '0';
    document.getElementById('flag-z').textContent = cpu.flags.z ? '1' : '0';
    document.getElementById('flag-ac').textContent = cpu.flags.ac ? '1' : '0';
    document.getElementById('flag-p').textContent = cpu.flags.p ? '1' : '0';
    document.getElementById('flag-cy').textContent = cpu.flags.cy ? '1' : '0';

    document.getElementById('status-badge').textContent = cpu.halted ? 'Halted' : (runInterval ? 'Running' : 'Idle');
    document.getElementById('status-badge').style.backgroundColor = cpu.halted ? '#fee2e2' : (runInterval ? '#f0fdf4' : '#e2e8f0');

    renderMemory();
    renderStack();
    renderFPU();
}

function formatFloat(value) {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return '+Infinity';
    if (value === -Infinity) return '-Infinity';
    return Number(value).toLocaleString('es-GT', { maximumSignificantDigits: 9 });
}

function renderFPU() {
    document.getElementById('fpu-a-value').textContent = formatFloat(fpu.operandA);
    document.getElementById('fpu-b-value').textContent = formatFloat(fpu.operandB);
    document.getElementById('fpu-result-value').textContent = formatFloat(fpu.result);
    document.getElementById('fpu-a-hex').textContent = '0x' + fpu.bytesToHex(fpu.operandABytes);
    document.getElementById('fpu-b-hex').textContent = '0x' + fpu.bytesToHex(fpu.operandBBytes);
    document.getElementById('fpu-result-hex').textContent = '0x' + fpu.bytesToHex(fpu.resultBytes);
    document.getElementById('fpu-operation').textContent = fpu.operationName;
    document.getElementById('fpu-status-hex').textContent =
        'STATUS 0x' + fpu.status.toString(16).toUpperCase().padStart(2, '0');

    const statusLabels = fpu.getStatusLabels();
    const statusBadge = document.getElementById('fpu-status-badge');
    statusBadge.textContent = statusLabels.join(' · ');
    statusBadge.className = 'fpu-status ' + (statusLabels.length > 1 ? 'warning' : 'ready');

    const activity = document.getElementById('fpu-activity');
    activity.innerHTML = '';
    if (fpu.activity.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'activity-empty';
        empty.textContent = 'Sin transferencias';
        activity.appendChild(empty);
        return;
    }

    fpu.activity.forEach(item => {
        const row = document.createElement('div');
        row.className = 'activity-row';

        const direction = document.createElement('span');
        direction.className = 'activity-direction ' + item.direction.toLowerCase();
        direction.textContent = item.direction;

        const port = document.createElement('code');
        port.textContent = item.port.toString(16).toUpperCase().padStart(2, '0') + 'H';

        const value = document.createElement('code');
        value.textContent = item.value.toString(16).toUpperCase().padStart(2, '0') + 'H';

        const detail = document.createElement('span');
        detail.textContent = item.detail;

        row.append(direction, port, value, detail);
        activity.appendChild(row);
    });
}

function renderStack() {
    const table = document.getElementById('stack-table');
    if (!table) return;
    table.innerHTML = '';

    const currentSP = cpu.registers.sp;

    // Show 5 slots (2-byte aligned) from SP - 4 to SP + 6
    for (let offset = 6; offset >= -4; offset -= 2) {
        const addr = (currentSP + offset) & 0xFFFF;

        const row = document.createElement('div');
        row.className = 'stack-row';
        if (offset === 0) {
            row.classList.add('active');
        }

        const addrSpan = document.createElement('span');
        addrSpan.className = 'stack-addr';
        addrSpan.textContent = (offset === 0 ? 'SP ➔ ' : '     ') + addr.toString(16).toUpperCase().padStart(4, '0') + ':';

        const low = cpu.readMemory(addr);
        const high = cpu.readMemory((addr + 1) & 0xFFFF);
        const val16 = (high << 8) | low;

        const valSpan = document.createElement('span');
        valSpan.className = 'stack-val';
        valSpan.textContent = val16.toString(16).toUpperCase().padStart(4, '0') + 'H (' + high.toString(16).toUpperCase().padStart(2, '0') + ' ' + low.toString(16).toUpperCase().padStart(2, '0') + ')';

        row.appendChild(addrSpan);
        row.appendChild(valSpan);
        table.appendChild(row);
    }
}

function renderMemory() {
    const table = document.getElementById('memory-table');
    table.innerHTML = '';

    // Header
    const empty = document.createElement('div');
    empty.className = 'mem-cell mem-header';
    empty.textContent = '';
    table.appendChild(empty);

    for (let i = 0; i < 16; i++) {
        const h = document.createElement('div');
        h.className = 'mem-cell mem-header';
        h.textContent = i.toString(16).toUpperCase();
        table.appendChild(h);
    }

    // Rows
    for (let row = 0; row < 8; row++) {
        const addr = (memoryStart + row * 16) & 0xFFFF;
        const h = document.createElement('div');
        h.className = 'mem-cell mem-addr';
        h.textContent = addr.toString(16).toUpperCase().padStart(4, '0');
        table.appendChild(h);

        for (let col = 0; col < 16; col++) {
            const cellAddr = (addr + col) & 0xFFFF;
            const c = document.createElement('div');
            c.className = 'mem-cell';
            if (cellAddr === cpu.registers.pc) c.style.backgroundColor = '#fde047';
            c.textContent = cpu.readMemory(cellAddr).toString(16).toUpperCase().padStart(2, '0');
            table.appendChild(c);
        }
    }
}

document.getElementById('btn-assemble').addEventListener('click', () => {
    const source = document.getElementById('code-editor').value;
    const output = document.getElementById('assembler-output');
    try {
        const result = assembler.assemble(source);
        cpu.reset();
        cpu.memory.set(result.binary);
        output.textContent = 'Assembly successful! Loaded into memory.';
        output.className = 'success';
        updateUI();
    } catch (e) {
        output.textContent = 'Error: ' + e.message;
        output.className = 'error';
    }
});

document.getElementById('btn-clear-code').addEventListener('click', () => {
    document.getElementById('code-editor').value = '';
    const output = document.getElementById('assembler-output');
    if (output) {
        output.textContent = '';
        output.className = '';
    }
});

document.getElementById('btn-step').addEventListener('click', () => {
    cpu.step();
    updateUI();
});

document.getElementById('btn-run').addEventListener('click', () => {
    if (runInterval) return;
    runInterval = setInterval(() => {
        if (cpu.halted) {
            clearInterval(runInterval);
            runInterval = null;
            updateUI();
            return;
        }
        for (let i = 0; i < 100; i++) { // Execute in bursts
            cpu.step();
            if (cpu.halted) break;
        }
        updateUI();
    }, 10);
    updateUI();
});

document.getElementById('btn-stop').addEventListener('click', () => {
    if (runInterval) {
        clearInterval(runInterval);
        runInterval = null;
        updateUI();
    }
});

document.getElementById('btn-reset').addEventListener('click', () => {
    if (runInterval) {
        clearInterval(runInterval);
        runInterval = null;
    }
    cpu.reset();

    // Clear assembler output
    const output = document.getElementById('assembler-output');
    if (output) {
        output.textContent = '';
        output.className = '';
    }

    // Reset memory start address and variable
    const memStartInput = document.getElementById('mem-start-addr');
    if (memStartInput) {
        memStartInput.value = '0000';
    }
    memoryStart = 0;

    updateUI();
});

document.getElementById('btn-mem-go').addEventListener('click', () => {
    const val = document.getElementById('mem-start-addr').value;
    memoryStart = parseInt(val, 16) || 0;
    renderMemory();
});

document.getElementById('btn-fpu-calculate').addEventListener('click', () => {
    const a = Number(document.getElementById('fpu-input-a').value);
    const b = Number(document.getElementById('fpu-input-b').value);
    const command = Number(document.getElementById('fpu-operation-select').value);

    fpu.setOperands(a, b);
    fpu.execute(command);
    updateUI();
});

document.getElementById('btn-load-fpu-demo').addEventListener('click', () => {
    document.getElementById('code-editor').value = FPU_DEMO_PROGRAM;
    document.getElementById('btn-assemble').click();
});

// Initial UI update
updateUI();
