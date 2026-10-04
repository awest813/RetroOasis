// SPDX-License-Identifier: MIT
// Two-console feasibility wrapper for SameBoy 1.0.3. Serial wiring and cycle
// balancing follow SameBoy's MIT-licensed libretro frontend. Not a shipping core.
#include "Core/gb.h"
#include <stdlib.h>

static GB_gameboy_t *gb[2];
static uint32_t pixels[2][160 * 144];
static bool outgoing[2];
static int delta;
static unsigned serial_bits;
static bool loaded[2], paused, has_run;
static void start0(GB_gameboy_t *g, bool bit) { outgoing[0] = bit; }
static void start1(GB_gameboy_t *g, bool bit) { outgoing[1] = bit; }
static bool end0(GB_gameboy_t *g) {
    bool bit = GB_serial_get_data_bit(gb[1]);
    GB_serial_set_data_bit(gb[1], outgoing[0]);
    serial_bits++;
    return bit;
}
static bool end1(GB_gameboy_t *g) {
    bool bit = GB_serial_get_data_bit(gb[0]);
    GB_serial_set_data_bit(gb[0], outgoing[1]);
    serial_bits++;
    return bit;
}
static uint32_t rgb(GB_gameboy_t *g, uint8_t r, uint8_t green, uint8_t b) {
    return r | (green << 8) | (b << 16) | 0xff000000;
}
void link_close(void) {
    for (unsigned i = 0; i < 2; i++) {
        if (gb[i]) { GB_dealloc(gb[i]); gb[i] = NULL; }
        loaded[i] = false; outgoing[i] = false;
    }
    delta = 0; serial_bits = 0;
    paused = false; has_run = false;
}
int link_set_cable(int connected) {
    if (!gb[0] || !gb[1] || (connected != 0 && connected != 1)) return 0;
    GB_disconnect_serial(gb[0]); GB_disconnect_serial(gb[1]);
    if (connected) {
        GB_set_serial_transfer_bit_start_callback(gb[0], start0);
        GB_set_serial_transfer_bit_end_callback(gb[0], end0);
        GB_set_serial_transfer_bit_start_callback(gb[1], start1);
        GB_set_serial_transfer_bit_end_callback(gb[1], end1);
    }
    return 1;
}
int link_set_paused(int value) {
    if (!gb[0] || !gb[1] || (value != 0 && value != 1)) return 0;
    paused = value;
    if (paused) for (unsigned slot = 0; slot < 2; slot++)
        for (unsigned key = 0; key < GB_KEY_MAX; key++) GB_set_key_state(gb[slot], key, false);
    return 1;
}
int link_init(int color) {
    if (color != 0 && color != 1) return 0;
    link_close();
    for (unsigned i = 0; i < 2; i++) {
        gb[i] = GB_init(GB_alloc(), color ? GB_MODEL_CGB_E : GB_MODEL_DMG_B);
        GB_set_pixels_output(gb[i], pixels[i]);
        GB_set_rgb_encode_callback(gb[i], rgb);
        GB_set_border_mode(gb[i], GB_BORDER_NEVER);
    }
    return link_set_cable(1);
}
int link_load(int slot, const uint8_t *rom, unsigned size, const uint8_t *boot, unsigned boot_size) {
    if (slot < 0 || slot > 1 || !gb[slot] || loaded[slot] || has_run || !rom || !boot
        || size < 0x150 || size > 8 * 1024 * 1024 || (boot_size != 256 && boot_size != 2304)) return 0;
    GB_load_rom_from_buffer(gb[slot], rom, size);
    GB_load_boot_rom_from_buffer(gb[slot], boot, boot_size);
    loaded[slot] = true;
    return 1;
}
unsigned link_step(unsigned budget) {
    if (!loaded[0] || !loaded[1] || paused || !budget || budget > 1000000) return 0;
    has_run = true;
    unsigned spent = 0;
    while (spent < budget) {
        unsigned cycles;
        if (delta >= 0) { cycles = GB_run(gb[0]); delta -= cycles; }
        else { cycles = GB_run(gb[1]); delta += cycles; }
        spent += cycles;
    }
    return spent;
}
int link_peek(int slot, unsigned address) {
    return slot >= 0 && slot < 2 && gb[slot] && address <= 0xffff ? GB_safe_read_memory(gb[slot], address) : -1;
}
unsigned link_serial_bits(void) { return serial_bits; }
void link_key(int slot, int key, int pressed) {
    if (slot >= 0 && slot < 2 && loaded[slot] && !paused && key >= 0 && key < GB_KEY_MAX) GB_set_key_state(gb[slot], key, pressed != 0);
}
uint32_t *link_pixels(int slot) { return slot >= 0 && slot < 2 && loaded[slot] ? pixels[slot] : NULL; }
int link_save_size(int slot) { return slot >= 0 && slot < 2 && loaded[slot] ? GB_save_battery_size(gb[slot]) : -1; }
int link_save(int slot, uint8_t *buffer, unsigned size) {
    int expected = link_save_size(slot);
    if (expected <= 0 || !buffer || size != (unsigned)expected) return -1;
    return GB_save_battery_to_buffer(gb[slot], buffer, size);
}
int link_restore(int slot, const uint8_t *buffer, unsigned size) {
    int expected = link_save_size(slot);
    // Save imports belong to session setup. Restoring while a trade is running
    // would replace battery data without restoring the matching CPU/serial state.
    if (has_run || expected <= 0 || !buffer || (unsigned)expected != size) return 0;
    GB_load_battery_from_buffer(gb[slot], buffer, size);
    return 1;
}
