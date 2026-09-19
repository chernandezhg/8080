/**
 * Coprocesador conceptual de punto flotante para el Intel 8080.
 *
 * El dispositivo usa valores IEEE 754 de precision simple (32 bits) y se
 * comunica con la CPU un byte a la vez mediante puertos de E/S.
 */
class FloatingPointCoprocessor {
    static PORTS = Object.freeze({
        OPERAND_A_START: 0x10,
        OPERAND_B_START: 0x14,
        COMMAND: 0x18,
        RESULT_START: 0x20,
        STATUS: 0x24
    });

    static COMMANDS = Object.freeze({
        RESET: 0x00,
        ADD: 0x01,
        SUBTRACT: 0x02,
        MULTIPLY: 0x03,
        DIVIDE: 0x04
    });

    static STATUS = Object.freeze({
        READY: 0x01,
        DIVIDE_BY_ZERO: 0x02,
        OVERFLOW: 0x04,
        UNDERFLOW: 0x08,
        INVALID: 0x10
    });

    constructor() {
        this.reset();
    }

    reset() {
        this.operandABytes = new Uint8Array(4);
        this.operandBBytes = new Uint8Array(4);
        this.resultBytes = new Uint8Array(4);
        this.command = FloatingPointCoprocessor.COMMANDS.RESET;
        this.status = FloatingPointCoprocessor.STATUS.READY;
        this.operationName = 'Esperando';
        this.activity = [];
    }

    handlesOutputPort(port) {
        return (port >= 0x10 && port <= 0x18);
    }

    handlesInputPort(port) {
        return (port >= 0x20 && port <= 0x24);
    }

    writePort(port, value) {
        port &= 0xFF;
        value &= 0xFF;

        if (port >= 0x10 && port <= 0x13) {
            this.operandABytes[port - 0x10] = value;
            this.recordActivity('OUT', port, value, 'Operando A');
            return true;
        }

        if (port >= 0x14 && port <= 0x17) {
            this.operandBBytes[port - 0x14] = value;
            this.recordActivity('OUT', port, value, 'Operando B');
            return true;
        }

        if (port === FloatingPointCoprocessor.PORTS.COMMAND) {
            this.recordActivity('OUT', port, value, 'Comando');
            if (value === FloatingPointCoprocessor.COMMANDS.RESET) {
                this.reset();
            } else {
                this.execute(value);
            }
            return true;
        }

        return false;
    }

    readPort(port) {
        port &= 0xFF;
        let value;
        let label;

        if (port >= 0x20 && port <= 0x23) {
            value = this.resultBytes[port - 0x20];
            label = 'Resultado';
        } else if (port === FloatingPointCoprocessor.PORTS.STATUS) {
            value = this.status;
            label = 'Estado';
        } else {
            return null;
        }

        this.recordActivity('IN', port, value, label);
        return value;
    }

    execute(command) {
        const a = this.bytesToFloat(this.operandABytes);
        const b = this.bytesToFloat(this.operandBBytes);
        let rawResult;

        this.command = command;
        this.status = FloatingPointCoprocessor.STATUS.READY;

        switch (command) {
            case FloatingPointCoprocessor.COMMANDS.ADD:
                this.operationName = 'Suma';
                rawResult = a + b;
                break;
            case FloatingPointCoprocessor.COMMANDS.SUBTRACT:
                this.operationName = 'Resta';
                rawResult = a - b;
                break;
            case FloatingPointCoprocessor.COMMANDS.MULTIPLY:
                this.operationName = 'Multiplicacion';
                rawResult = a * b;
                break;
            case FloatingPointCoprocessor.COMMANDS.DIVIDE:
                this.operationName = 'Division';
                if (b === 0 && Number.isFinite(a)) {
                    this.status |= FloatingPointCoprocessor.STATUS.DIVIDE_BY_ZERO;
                }
                rawResult = a / b;
                break;
            default:
                this.operationName = 'Comando invalido';
                this.status |= FloatingPointCoprocessor.STATUS.INVALID;
                rawResult = NaN;
        }

        const result = Math.fround(rawResult);

        if (Number.isNaN(result)) {
            this.status |= FloatingPointCoprocessor.STATUS.INVALID;
        }
        if (!Number.isFinite(result) && Number.isFinite(a) && Number.isFinite(b) &&
            !(this.status & FloatingPointCoprocessor.STATUS.DIVIDE_BY_ZERO)) {
            this.status |= FloatingPointCoprocessor.STATUS.OVERFLOW;
        }
        if (result === 0 && rawResult !== 0 && Number.isFinite(rawResult)) {
            this.status |= FloatingPointCoprocessor.STATUS.UNDERFLOW;
        }

        this.resultBytes = this.floatToBytes(result);
        this.recordActivity('FPU', command, this.status,
            `${this.operationName}: ${this.formatNumber(a)} y ${this.formatNumber(b)} = ${this.formatNumber(result)}`);
        return result;
    }

    setOperands(a, b) {
        this.operandABytes = this.floatToBytes(a);
        this.operandBBytes = this.floatToBytes(b);
    }

    get operandA() {
        return this.bytesToFloat(this.operandABytes);
    }

    get operandB() {
        return this.bytesToFloat(this.operandBBytes);
    }

    get result() {
        return this.bytesToFloat(this.resultBytes);
    }

    floatToBytes(value) {
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setFloat32(0, Number(value), true);
        return new Uint8Array(buffer.slice(0));
    }

    bytesToFloat(bytes) {
        const buffer = new ArrayBuffer(4);
        new Uint8Array(buffer).set(bytes);
        return new DataView(buffer).getFloat32(0, true);
    }

    bytesToHex(bytes) {
        return Array.from(bytes)
            .reverse()
            .map(byte => byte.toString(16).toUpperCase().padStart(2, '0'))
            .join('');
    }

    getStatusLabels() {
        const labels = [];
        if (this.status & FloatingPointCoprocessor.STATUS.READY) labels.push('READY');
        if (this.status & FloatingPointCoprocessor.STATUS.DIVIDE_BY_ZERO) labels.push('DIV/0');
        if (this.status & FloatingPointCoprocessor.STATUS.OVERFLOW) labels.push('OVERFLOW');
        if (this.status & FloatingPointCoprocessor.STATUS.UNDERFLOW) labels.push('UNDERFLOW');
        if (this.status & FloatingPointCoprocessor.STATUS.INVALID) labels.push('INVALID');
        return labels;
    }

    recordActivity(direction, port, value, detail) {
        this.activity.unshift({ direction, port: port & 0xFF, value: value & 0xFF, detail });
        this.activity = this.activity.slice(0, 8);
    }

    formatNumber(value) {
        if (Number.isNaN(value)) return 'NaN';
        if (value === Infinity) return '+Infinity';
        if (value === -Infinity) return '-Infinity';
        return String(value);
    }
}

if (typeof module !== 'undefined') {
    module.exports = FloatingPointCoprocessor;
}
