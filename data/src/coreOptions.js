/** Normalize core-provided values without changing the keys sent to RetroArch. */
export function coreMenuOptions(json, legacy) {
    if (json) {
        return json.options.filter(option => option.visible !== false).map(option => {
            const values = [...new Map(option.values.map(value => [value.value, {
                value: value.value, label: value.label || value.value
            }])).values()];
            const has = value => values.some(entry => entry.value === value);
            return {
                key: option.key,
                title: option.desc || option.key,
                info: option.info || "",
                values,
                selected: has(option.current) ? option.current : has(option.default) ? option.default : values[0]?.value
            };
        }).filter(option => option.values.length > 1);
    }
    if (typeof legacy !== "string") return [];
    return legacy.split(/\r?\n/).flatMap(line => {
        const separator = line.indexOf("; ");
        if (separator < 1) return [];
        const [key, current] = line.slice(0, separator).split("|");
        if (!key) return [];
        let defaultValue;
        const values = [...new Set(line.slice(separator + 2).split("|").filter(Boolean).map(value => {
            if (value.startsWith("(Default) ")) {
                value = value.slice(10);
                defaultValue = value;
            }
            return value;
        }))].map(value => ({ value, label: value }));
        if (values.length < 2) return [];
        return [{
            key, title: key.replace(/_/g, " ").replace(/.+\-(.+)/, "$1"), info: "", values,
            selected: values.some(entry => entry.value === current) ? current : defaultValue ?? values[0].value
        }];
    });
}
