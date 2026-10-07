// SPDX-License-Identifier: GPL-2.0-or-later
// Experimental frontend for the pinned gpSP Libretro netpacket interface.
#include "libretro.h"
#include <emscripten.h>
#include <string.h>
#include <stdarg.h>
#include <stdio.h>

static struct retro_netpacket_callback packets;
static uint16_t keys;
static uint16_t pixels[240 * 160];
static unsigned frames, audio_frames;
static unsigned pressed_polls;
static uint16_t observed_keys;
static bool initialized, loaded, started, paused;
static unsigned client_id, membership;
static const char *serial_option = "mul_aw1";
extern uint32_t sound_frequency, backup_type, backup_type_reset, flash_bank_cnt, eeprom_size;
// Interleaved stereo int16 at sound_frequency; the browser drains it every frame.
#define GBA_AUDIO_FRAMES 16384
static int16_t audio[GBA_AUDIO_FRAMES * 2];
static unsigned audio_head, audio_count;
static void push_audio(int16_t left, int16_t right) {
    unsigned at = (audio_head + audio_count) % GBA_AUDIO_FRAMES;
    audio[at * 2] = left; audio[at * 2 + 1] = right;
    if (audio_count < GBA_AUDIO_FRAMES) audio_count++;
    else audio_head = (audio_head + 1) % GBA_AUDIO_FRAMES;
}
EM_JS(void, send_packet, (int flags, const void *buffer, unsigned length, unsigned target), {
    if (Module.onPacket) Module.onPacket(flags, HEAPU8.slice(buffer, buffer + length), target);
});
EM_JS(void, poll_packets, (), { if (Module.onPoll) Module.onPoll(); });
static void send_cb(int flags, const void *buffer, size_t length, uint16_t target) {
    if (started && buffer && length && length <= 65536 && (target == 65535 || (target < 2 && target != client_id)))
        send_packet(flags,buffer,length,target);
}
static void poll_cb(void) { poll_packets(); }
static void logger(enum retro_log_level level, const char *format, ...) {
    if (level < RETRO_LOG_WARN) return;
    va_list args; va_start(args,format); vfprintf(stderr,format,args); va_end(args);
}
static bool environment(unsigned command, void *data) {
    switch(command) {
      case RETRO_ENVIRONMENT_SET_NETPACKET_INTERFACE: packets = *(struct retro_netpacket_callback*)data; return true;
      case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *(unsigned*)data = 2; return true;
      case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: ((struct retro_log_callback*)data)->log = logger; return true;
      case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *(bool*)data = false; return true;
      case RETRO_ENVIRONMENT_GET_VARIABLE: {
        struct retro_variable *variable = data;
        if (!strcmp(variable->key,"gpsp_serial")) variable->value = serial_option;
        else if (!strcmp(variable->key,"gpsp_bios")) variable->value = "builtin";
        else if (!strcmp(variable->key,"gpsp_boot_mode")) variable->value = "game";
        else return false;
        return true;
      }
      case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
      case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *(const char**)data = "/"; return true;
      case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: return *(enum retro_pixel_format*)data == RETRO_PIXEL_FORMAT_RGB565;
      case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_V2:
      case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_V2_INTL:
      case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
      case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
      case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO:
      case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME: return true;
      default: return false;
    }
}
static void video(const void *data, unsigned width, unsigned height, size_t pitch) {
    if (!data || width != 240 || height != 160) return;
    for (unsigned y = 0; y < 160; y++) memcpy(pixels + y*240,(const uint8_t*)data+y*pitch,480);
    frames++;
}
static void audio_sample(int16_t left, int16_t right) { audio_frames++; push_audio(left, right); }
static size_t audio_batch(const int16_t *data, size_t count) {
    audio_frames += count;
    for (size_t i = 0; i < count; i++) push_audio(data[i * 2], data[i * 2 + 1]);
    return count;
}
static void poll_input(void) {}
static int16_t input(unsigned port,unsigned device,unsigned index,unsigned id) {
    if (port == 0 && device == RETRO_DEVICE_JOYPAD) {
        observed_keys = keys;
        if (keys) pressed_polls++;
    }
    return port == 0 && device == RETRO_DEVICE_JOYPAD && id < 16 && (keys & (1u << id)) ? 1 : 0;
}
int gba_init(void) {
    if (initialized) return 0;
    frames = audio_frames = pressed_polls = observed_keys = keys = membership = 0;
    audio_head = audio_count = 0;
    paused = false;
    retro_set_environment(environment); retro_set_video_refresh(video);
    retro_set_audio_sample(audio_sample); retro_set_audio_sample_batch(audio_batch);
    retro_set_input_poll(poll_input); retro_set_input_state(input);
    retro_init(); initialized = true;
    return packets.start && packets.receive && packets.connected && packets.disconnected && packets.stop;
}
/* Link modes: 0 = gpSP's per-game automatic choice, 1 = Pokémon Gen 3 cable
 * (mul_poke), 2 = GBA Wireless Adapter (rfu), 3 = Advance Wars cable (mul_aw1).
 * Both linked consoles must use the same mode. */
int gba_load(const char *path, int mode) {
    static const char *modes[] = {"auto", "mul_poke", "rfu", "mul_aw1"};
    if (!initialized || loaded || started || !path || mode < 0 || mode > 3) return 0;
    // Reject files without the fixed GBA header byte instead of booting junk.
    FILE *file = fopen(path,"rb");
    unsigned char fixed = 0;
    if (!file) return 0;
    bool cartridge = fseek(file,0xb2,SEEK_SET) == 0 && fread(&fixed,1,1,file) == 1 && fixed == 0x96;
    fclose(file);
    if (!cartridge) return 0;
    serial_option = modes[mode];
    struct retro_game_info game = {path, NULL, 0, NULL};
    loaded = retro_load_game(&game); return loaded;
}
int gba_start(unsigned id) {
    if (!loaded || started || id > 1) return 0;
    client_id = id; membership = 0; started = true;
    packets.start(id,send_cb,poll_cb); return 1;
}
int gba_connect(unsigned id) {
    if (!started || id > 1 || id == client_id) return 0;
    if (membership & (1u << id)) return 1;
    if (!packets.connected(id)) return 0;
    membership |= 1u << id; return 1;
}
int gba_disconnect(unsigned id) {
    if (!started || id > 1 || !(membership & (1u << id))) return 0;
    packets.disconnected(id); membership &= ~(1u << id); keys = 0; return 1;
}
void gba_receive(const void *buffer,unsigned length,unsigned sender) {
    if (started && buffer && length && sender < 2 && (membership & (1u << sender)) && length <= 65536)
        packets.receive(buffer,length,sender);
}
void gba_run(void) { if (loaded && !paused) retro_run(); }
void gba_key(unsigned id,int pressed) { if (loaded && !paused && id < 16) { if (pressed) keys |= 1u << id; else keys &= ~(1u << id); } }
int gba_set_paused(int value) {
    if (!loaded || (value != 0 && value != 1)) return 0;
    paused = value; if (paused) keys = 0; return 1;
}
unsigned gba_frames(void) { return frames; }
unsigned gba_sample_rate(void) { return sound_frequency; }
extern int serial_mode;
/* gpSP's resolved link mode after loading: 0 none, 1 GB Player, 2 wireless
 * adapter, 3 Pokémon cable, 4/5 Advance Wars cable, 6 auto (no game match). */
int gba_link_mode(void) { return loaded ? serial_mode : -1; }
unsigned gba_audio(int16_t *buffer, unsigned max_frames) {
    if (!buffer) return 0;
    unsigned count = audio_count < max_frames ? audio_count : max_frames;
    for (unsigned i = 0; i < count; i++) {
        unsigned at = (audio_head + i) % GBA_AUDIO_FRAMES;
        buffer[i * 2] = audio[at * 2]; buffer[i * 2 + 1] = audio[at * 2 + 1];
    }
    audio_head = (audio_head + count) % GBA_AUDIO_FRAMES; audio_count -= count;
    return count;
}
/* Backup size in the usual .sav layout; 0 until the cartridge type is known. */
int gba_save_size(void) {
    if (!loaded) return -1;
    unsigned type = backup_type != 3 ? backup_type : backup_type_reset;
    if (type == 1) return flash_bank_cnt == 2 ? 131072 : 65536;
    if (type == 2) return eeprom_size == 16 ? 8192 : 512;
    if (type == 0) return 32768;
    return 0;
}
const uint8_t *gba_save_data(void) { return loaded ? retro_get_memory_data(RETRO_MEMORY_SAVE_RAM) : NULL; }
/* Imports belong to session setup, like a frontend loading .srm before the first frame. */
int gba_restore(const uint8_t *buffer, unsigned size) {
    if (!loaded || frames || !buffer) return 0;
    if (size != 512 && size != 8192 && size != 32768 && size != 65536 && size != 131072) return 0;
    uint8_t *backup = retro_get_memory_data(RETRO_MEMORY_SAVE_RAM);
    memset(backup, 0xff, retro_get_memory_size(RETRO_MEMORY_SAVE_RAM));
    memcpy(backup, buffer, size);
    return 1;
}
unsigned gba_audio_frames(void) { return audio_frames; }
unsigned gba_pressed_polls(void) { return pressed_polls; }
unsigned gba_observed_keys(void) { return observed_keys; }
const uint16_t *gba_pixels(void) { return pixels; }
void gba_close(void) {
    if (!initialized) return;
    if (started) { started = false; packets.stop(); }
    if (loaded) retro_unload_game(); loaded = false;
    retro_deinit(); memset(&packets,0,sizeof(packets)); keys = membership = 0;
    initialized = paused = false;
}
