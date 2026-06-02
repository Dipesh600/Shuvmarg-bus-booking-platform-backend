const fs = require('fs');
const file = '/Users/dipeshchaudhary/Downloads/Shuvmarg/shuvmarg_super_admin/src/components/busowners/operator_tabs/CreateScheduleModal.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add state variable for startsFromOrigin
code = code.replace(
    'const [variantId, setVariantId]             = useState("");',
    `const [baseVariantId, setBaseVariantId]     = useState("");\n    const [startsFromOrigin, setStartsFromOrigin] = useState<boolean>(true);`
);

// 2. Replace handleVariantChange to handle baseVariantId
const handleRegex = /const handleVariantChange = [\s\S]*?setRouteName\(""\);\n\s*\}\n\s*};\n/m;
code = code.replace(handleRegex, `
    // Computed variantId based on starting point
    const variantId = React.useMemo(() => {
        if (!baseVariantId) return "";
        const config = configs?.data?.find((c: any) => String(c.variantId?._id) === baseVariantId);
        if (!config) return "";
        return startsFromOrigin ? baseVariantId : String(config.variantId?.returnVariantId || baseVariantId);
    }, [baseVariantId, startsFromOrigin, configs]);

    const handleRouteSelect = (vId: string) => {
        setBaseVariantId(vId);
        const config = configs?.data?.find((c: any) => String(c.variantId?._id) === vId);
        if (config) {
            const origin = config.variantId?.corridorId?.originId?.name;
            const dest   = config.variantId?.corridorId?.destinationId?.name;
            setRouteName(origin && dest ? \`\${origin} ↔ \${dest}\` : "");

            // Pre-fill timings based on direction
            const tc = config.timingConfig ?? [];
            const rtc = config.returnConfig?.timingConfig ?? [];
            
            // If they start from origin, Outbound = tc, Return = rtc
            // If they start from dest, Outbound = rtc, Return = tc
            const outboundTc = startsFromOrigin ? tc : rtc;
            const returnTc = startsFromOrigin ? rtc : tc;

            if (outboundTc.length > 0) {
                const dep24 = to24h(outboundTc[0]?.estimatedDeparture);
                const arr24 = to24h(outboundTc[outboundTc.length - 1]?.estimatedArrival);
                if (dep24) { setDepartureTime(dep24); setShift(detectShift(dep24)); }
                if (arr24) setArrivalTime(arr24);
            }
            if (returnTc.length > 0) {
                const retDep24 = to24h(returnTc[0]?.estimatedDeparture);
                const retArr24 = to24h(returnTc[returnTc.length - 1]?.estimatedArrival);
                if (retDep24) setReturnDepartureTime(retDep24);
                if (retArr24) setReturnArrivalTime(retArr24);
                if (retDep24) setOperationalModel(detectShift(retDep24) === "night" ? "RELAY" : "TURNAROUND");
            }
        } else {
            setRouteName("");
        }
    };

    // Re-run handleRouteSelect if startsFromOrigin changes so timings swap
    React.useEffect(() => {
        if (baseVariantId) handleRouteSelect(baseVariantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startsFromOrigin]);
`);

// 3. Update createMut to use variantId correctly and hardcode hasReturn = true
code = code.replace(
    'const [hasReturn, setHasReturn]             = useState(false);',
    'const hasReturn = true; // Industry standard: always bidirectional'
);

code = code.replace(
    /variantId: variantId \|\| undefined,/g,
    'variantId: variantId || undefined,'
);

code = code.replace(
    /const selectedConfig = configs\?\.data\?\.find\([\s\S]*?\);\n\s*const resolvedReturnVariantId = selectedConfig\?\.variantId\?\.returnVariantId\n\s*\? String\(selectedConfig\.variantId\.returnVariantId\)\n\s*: variantId; \/\/ fallback: same variant \(should never happen in production\)/m,
    `// The return variant is simply the opposite of the selected direction
                const config = configs?.data?.find((c: any) => String(c.variantId?._id) === baseVariantId);
                const resolvedReturnVariantId = startsFromOrigin 
                    ? String(config?.variantId?.returnVariantId || baseVariantId)
                    : baseVariantId;`
);

// 4. Update UI in Step 1 to filter only FORWARD configs and show radio group
const step1UiRegex = /<FieldLabel hint="Select the starting direction of the cycle">Operating Route<\/FieldLabel>[\s\S]*?<\/Select>/m;
code = code.replace(step1UiRegex, `
                                    <FieldLabel hint="Industry standard bidirectional route">Assigned Route</FieldLabel>
                                    <Select value={baseVariantId} onValueChange={handleRouteSelect}>
                                        <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select route" /></SelectTrigger>
                                        <SelectContent className="rounded-xl">
                                            {configs?.data?.filter((c:any) => c.variantId?.direction === "FORWARD").map((c: any) => {
                                                if (!c.variantId) return null;
                                                const vid = String(c.variantId._id);
                                                const oName = c.variantId.corridorId?.originId?.name || "Origin";
                                                const dName = c.variantId.corridorId?.destinationId?.name || "Destination";
                                                return (
                                                    <SelectItem key={vid} value={vid}>
                                                        {oName} ↔ {dName} ({c.variantId.name})
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
`);

// 5. Add Radio Group for Starting Point just below the route select
const routeNameUiRegex = /\{routeName && \([\s\S]*?\}\)/m;
code = code.replace(routeNameUiRegex, `
                                    {routeName && (
                                        <div className="mt-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                                            <FieldLabel hint="Where does this bus start its cycle today?">Cycle Starts From</FieldLabel>
                                            <div className="flex gap-2 mt-2">
                                                <button
                                                    onClick={() => setStartsFromOrigin(true)}
                                                    className={\`flex-1 py-2 text-xs font-bold rounded-lg border transition-all \${startsFromOrigin ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted"}\`}
                                                >
                                                    {configs?.data?.find((c:any) => String(c.variantId?._id) === baseVariantId)?.variantId?.corridorId?.originId?.name || "Origin"}
                                                </button>
                                                <button
                                                    onClick={() => setStartsFromOrigin(false)}
                                                    className={\`flex-1 py-2 text-xs font-bold rounded-lg border transition-all \${!startsFromOrigin ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted"}\`}
                                                >
                                                    {configs?.data?.find((c:any) => String(c.variantId?._id) === baseVariantId)?.variantId?.corridorId?.destinationId?.name || "Destination"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
`);

// 6. Remove the "Add Return Schedule" toggle from Step 4
const toggleRegex = /<div className="flex items-center justify-between p-4 rounded-xl bg-indigo-50 border border-indigo-100">[\s\S]*?<\/div>\n\n/m;
code = code.replace(toggleRegex, '');

fs.writeFileSync(file, code);
