import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { searchPersons } from "@/lib/persons/functions";

type Hit = { id: string; display_name: string; kind?: string };

export function DealPersonPicker(props: {
  label: string;
  valueId: string | null;
  valueName: string;
  kind?: "individual" | "organization" | "all";
  onPick: (hit: Hit) => void;
}) {
  const searchFn = useServerFn(searchPersons);
  const [query, setQuery] = useState(props.valueName);
  const debounced = useDebounce(query, 350);
  const searchQ = useQuery({
    queryKey: ["deal-person-search", props.kind ?? "all", debounced],
    enabled: debounced.trim().length >= 2,
    queryFn: () =>
      searchFn({
        data: { query: debounced.trim(), kind: props.kind === "all" ? undefined : props.kind },
      }),
  });
  const hits = ((searchQ.data ?? []) as Hit[]).filter((p) =>
    props.kind && props.kind !== "all" ? p.kind === props.kind : true,
  );
  return (
    <div>
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!e.target.value) props.onPick({ id: "", display_name: "" });
        }}
        placeholder={props.label}
        aria-label={props.label}
      />
      {hits.length > 0 ? (
        <ul className="mt-1 max-h-32 overflow-auto rounded border text-sm">
          {hits.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full px-2 py-1 text-right hover:bg-muted"
                onClick={() => {
                  setQuery(p.display_name);
                  props.onPick(p);
                }}
              >
                {p.display_name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {props.valueId ? <p className="text-xs text-muted-foreground">{props.valueName}</p> : null}
    </div>
  );
}
