package main

import (
	"fmt"
	"github.com/alttpo/snes/asm"
	"log"
	"testing"
)

func TestPauseAsmEmitter(t *testing.T) {
	a := asm.NewEmitter(make([]byte, 0x200), true)
	a.SetBase(0x2C00)
	a.AssumeSEP(0x30)

	a.SEI()

	a.SEP(0x30)
	a.PHA()

	a.Comment("read NMI status to clear it:")
	a.LDA_abs(0x4210)

	a.BRA("check_paused")

	pausedStateAddr := uint16(a.Label("paused_state") & 0x00_FFFF)
	inNmiStateAddr := pausedStateAddr + 1
	a.EmitBytes([]byte{0x00, 0x00})

	// are we already paused? i.e. is this another NMI interrupt after the fact?
	a.Label("check_paused")
	a.LDA_abs(inNmiStateAddr)
	a.BEQ("loop_init")
	a.PLA()
	a.RTI()

	a.Label("loop_init")
	a.LDA_imm8_b(0xEA)
	a.STA_abs(inNmiStateAddr)

	a.Label("loop")
	a.Comment(fmt.Sprintf("loop until external non-zero write to $%04X", pausedStateAddr))
	a.LDA_abs(pausedStateAddr)
	a.BEQ("loop")

	a.Comment("disable NMI override:")
	a.STZ_abs(0x2C00)

	a.PLA()

	a.Comment("jump to original NMI:")
	a.JMP_indirect(0xFFEA)

	if err := a.Finalize(); err != nil {
		t.Fatal(err)
	}
	a.WriteHexTo(log.Writer())

	fmt.Println()
	for _, b := range a.Bytes() {
		fmt.Printf("0x%02x, ", b)
	}
	fmt.Println()
}
