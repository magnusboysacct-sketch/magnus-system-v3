import { supabase } from "../../lib/supabase";
import { useMasterLists } from "../../hooks/useMasterLists";
import EditableDropdown from "../common/EditableDropdown";

interface MasterUnitSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export default function MasterUnitSelect({
  value,
  onChange,
  disabled = false,
  placeholder = "Select unit...",
  className = "",
}: MasterUnitSelectProps) {
  const { units, refresh } = useMasterLists();
  const options = units.map(u => u.name);

  async function handleAdd(name: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user!.id).single();
    await supabase.from("master_units").insert({
      name,
      company_id: profile?.company_id,
      is_active: true,
      unit_type: "other",
      sort_order: units.length + 1,
    });
    await refresh();
  }

  async function handleDelete(name: string) {
    await supabase.from("master_units").delete().eq("name", name);
    await refresh();
  }

  return (
    <EditableDropdown
      value={value}
      onChange={onChange}
      options={options}
      onAddOption={handleAdd}
      onDeleteOption={handleDelete}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
