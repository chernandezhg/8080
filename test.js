// test.js - Unit tests for Intel 8080 CPU and Assembler
const Intel8080 = require('./cpu.js');
const Assembler8080 = require('./assembler.js');
const FloatingPointCoprocessor = require('./fpu.js');
const assert = require('assert');

console.log('--- Running Intel 8080 Emulator & Assembler Tests ---');

// Helper to run a test block and report status
function runTest(name, fn) {
    try {
        fn();
        console.log(`[PASS] ${name}`);
    } catch (e) {
        console.error(`[FAIL] ${name}`);
        console.error(e);
        process.exit(1);
    }
}

runTest('CPU Reset & Initial Values', () => {
    const cpu = new Intel8080();
    assert.strictEqual(cpu.registers.a, 0);
    assert.strictEqual(cpu.registers.b, 0);
    assert.strictEqual(cpu.registers.sp, 0xFFFF);
    assert.strictEqual(cpu.registers.pc, 0);
    assert.strictEqual(cpu.flags.z, false);
    assert.strictEqual(cpu.flags.cy, false);
    assert.strictEqual(cpu.halted, false);
});

runTest('INR / DCR AC Flag Behavior', () => {
    const cpu = new Intel8080();

    // INR 0x0F -> should set AC
    cpu.registers.a = 0x0F;
    cpu.execute(0x3C); // INR A
    assert.strictEqual(cpu.registers.a, 0x10);
    assert.strictEqual(cpu.flags.ac, true, 'INR 0x0F should set AC flag');

    // DCR 0x10 -> should clear AC (as there is a borrow out of low order nibble, complement of borrow is 0)
    cpu.registers.a = 0x10;
    cpu.execute(0x3D); // DCR A
    assert.strictEqual(cpu.registers.a, 0x0F);
    assert.strictEqual(cpu.flags.ac, false, 'DCR 0x10 should clear AC flag');

    // DCR 0x0F -> should set AC (as there is no borrow out of low order nibble, complement of borrow is 1)
    cpu.registers.a = 0x0F;
    cpu.execute(0x3D); // DCR A
    assert.strictEqual(cpu.registers.a, 0x0E);
    assert.strictEqual(cpu.flags.ac, true, 'DCR 0x0F should set AC flag');
});

runTest('Subtraction AC and Carry Flag Logic', () => {
    const cpu = new Intel8080();

    // Test: 0x3E - 0x05 (no borrow)
    cpu.registers.a = 0x3E;
    cpu.executeALU(2, 0x05); // SUB 0x05 (ALU op 2 is SUB)
    assert.strictEqual(cpu.registers.a, 0x39);
    assert.strictEqual(cpu.flags.cy, false);
    // (0x0E & 0x0F) - (0x05 & 0x0F) = 0x0E - 0x05 = 0x09 >= 0, so AC flag calculation should match physical 8080
    // In physical 8080, SUB does: A + ~B + 1.
    // Let's check AC logic: 0x3E + ~0x05 + 1 = 0x3E + 0xFA + 1. Low nibbles: 0x0E + 0x0A + 1 = 0x19 (carry out is 1)
    // Physical 8080 does not invert AC after subtraction, so AC = 1.
    assert.strictEqual(cpu.flags.ac, true, 'SUB 0x3E - 0x05 should result in AC = 1 (since 0x0E + 0x0A + 1 = 0x19)');

    // Test: 0x00 - 0x01
    cpu.reset();
    cpu.registers.a = 0x00;
    cpu.executeALU(2, 0x01); // SUB 0x01
    assert.strictEqual(cpu.registers.a, 0xFF);
    assert.strictEqual(cpu.flags.cy, true, '0x00 - 0x01 should set carry (borrow)');
    // Low nibbles: 0x00 + ~0x01 + 1 = 0x00 + 0x0E + 1 = 0x0F (carry out is 0). Thus AC = 0.
    assert.strictEqual(cpu.flags.ac, false, '0x00 - 0x01 should result in AC = 0');
});

runTest('Rotate Masking (RLC / RAL accumulator 8-bit safety)', () => {
    const cpu = new Intel8080();

    // RLC with MSB set: 0x80 -> should rotate to 0x01, CY = true
    cpu.registers.a = 0x80;
    cpu.execute(0x07); // RLC
    assert.strictEqual(cpu.registers.a, 0x01);
    assert.strictEqual(cpu.flags.cy, true);

    // RAL with MSB set and CY = false: 0x80 -> should rotate to 0x00, CY = true
    cpu.reset();
    cpu.registers.a = 0x80;
    cpu.flags.cy = false;
    cpu.execute(0x17); // RAL
    assert.strictEqual(cpu.registers.a, 0x00);
    assert.strictEqual(cpu.flags.cy, true);
});

runTest('Assembler Supports Pair Names (BC, DE, HL)', () => {
    const assembler = new Assembler8080();
    const source = `
        LXI BC, 1234H
        LXI DE, 5678H
        LXI HL, 9ABCH
    `;
    const result = assembler.assemble(source);
    const bin = result.binary;

    // LXI BC, 1234H -> 01 34 12
    assert.strictEqual(bin[0], 0x01);
    assert.strictEqual(bin[1], 0x34);
    assert.strictEqual(bin[2], 0x12);

    // LXI DE, 5678H -> 11 78 56
    assert.strictEqual(bin[3], 0x11);
    assert.strictEqual(bin[4], 0x78);
    assert.strictEqual(bin[5], 0x56);

    // LXI HL, 9ABCH -> 21 BC 9A
    assert.strictEqual(bin[6], 0x21);
    assert.strictEqual(bin[7], 0xBC);
    assert.strictEqual(bin[8], 0x9A);
});

runTest('Assembler Supports RST 0 - RST 7 Instructions', () => {
    const assembler = new Assembler8080();
    const source = `
        RST 0
        RST 3
        RST 7
    `;
    const result = assembler.assemble(source);
    const bin = result.binary;

    assert.strictEqual(bin[0], 0xC7); // RST 0
    assert.strictEqual(bin[1], 0xDF); // RST 3
    assert.strictEqual(bin[2], 0xFF); // RST 7
});

runTest('Assembler Rejects Invalid Code & Registers', () => {
    const assembler = new Assembler8080();

    // Test invalid register
    assert.throws(() => {
        assembler.assemble('MOV B, X');
    }, /Invalid register/i);

    // Test MOV M, M (illegal instruction on 8080)
    assert.throws(() => {
        assembler.assemble('MOV M, M');
    }, /Cannot use MOV M, M/i);

    // Test undefined labels
    assert.throws(() => {
        assembler.assemble('JMP UNDEFINED_LABEL');
    }, /Undefined label/i);
});

runTest('FPU performs IEEE 754 Float32 arithmetic', () => {
    const fpu = new FloatingPointCoprocessor();
    fpu.setOperands(1.5, 2.25);
    const result = fpu.execute(FloatingPointCoprocessor.COMMANDS.ADD);

    assert.strictEqual(result, 3.75);
    assert.strictEqual(fpu.result, 3.75);
    assert.strictEqual(fpu.bytesToHex(fpu.resultBytes), '40700000');
    assert.deepStrictEqual(fpu.getStatusLabels(), ['READY']);
});

runTest('FPU reports division by zero', () => {
    const fpu = new FloatingPointCoprocessor();
    fpu.setOperands(8, 0);
    fpu.execute(FloatingPointCoprocessor.COMMANDS.DIVIDE);

    assert.strictEqual(fpu.result, Infinity);
    assert.ok(fpu.status & FloatingPointCoprocessor.STATUS.DIVIDE_BY_ZERO);
});

runTest('8080 communicates with the FPU through IN/OUT ports', () => {
    const fpu = new FloatingPointCoprocessor();
    const cpu = new Intel8080(fpu);
    const assembler = new Assembler8080();
    const source = `
        MVI A, 00H
        OUT 10H
        OUT 11H
        MVI A, C0H
        OUT 12H
        MVI A, 3FH
        OUT 13H

        MVI A, 00H
        OUT 14H
        OUT 15H
        MVI A, 10H
        OUT 16H
        MVI A, 40H
        OUT 17H

        MVI A, 01H
        OUT 18H
        IN 22H
        STA 2000H
        HLT
    `;

    const program = assembler.assemble(source);
    cpu.memory.set(program.binary);
    while (!cpu.halted) cpu.step();

    assert.strictEqual(fpu.operandA, 1.5);
    assert.strictEqual(fpu.operandB, 2.25);
    assert.strictEqual(fpu.result, 3.75);
    assert.strictEqual(cpu.readMemory(0x2000), 0x70);
});

console.log('All tests completed successfully!');
