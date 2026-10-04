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
        if (!strcmp(variable->key,"gpsp_serial")) variable->value = "mul_aw1";
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
static void audio_sample(int16_t left, int16_t right) { audio_frames++; }
static size_t audio_batch(const int16_t *data, size_t count) { audio_frames += count; return count; }
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
    paused = false;
    retro_set_environment(environment); retro_set_video_refresh(video);
    retro_set_audio_sample(audio_sample); retro_set_audio_sample_batch(audio_batch);
    retro_set_input_poll(poll_input); retro_set_input_state(input);
    retro_init(); initialized = true;
    return packets.start && packets.receive && packets.connected && packets.disconnected && packets.stop;
}
int gba_load(const char *path) {
    if (!initialized || loaded || started || !path) return 0;
    // This prototype selects mul_aw1. Refuse other cartridges rather than
    // silently running them with an incompatible cable protocol.
    FILE *file = fopen(path,"rb");
    char code[4];
    if (!file) return 0;
    bool compatible = fseek(file,0xac,SEEK_SET) == 0 && fread(code,1,4,file) == 4 && !memcmp(code,"AWRE",4);
    fclose(file);
    if (!compatible) return 0;
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
