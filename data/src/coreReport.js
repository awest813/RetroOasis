/** Core reports arrive as one UTF-8 file in the download cache envelope. */
export function parseCoreReport(result) {
    try {
        let value = result?.data ?? result;
        if (value?.files) value = value.files[0]?.bytes;
        if (value instanceof Uint8Array || value instanceof ArrayBuffer) value = new TextDecoder().decode(value);
        if (typeof value === "string") value = JSON.parse(value);
        return value && typeof value === "object" && !Array.isArray(value) && typeof value.buildStart === "string" ? value : {};
    } catch { return {}; }
}
