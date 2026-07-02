import { supabase } from "../../lib/supabase";
import { useMasterLists } from "../../hooks/useMasterLists";
import EditableDropdown from "../common/EditableDropdown";

interface MasterCategorySelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export default function MasterCategorySelect({
  value,
  onChange,
  disabled = false,
  placeholder = "Select category...",
  className = "",
}: MasterCategorySelectProps) {
  const { categories, refresh } = useMasterLists();
  const options = categories.map(c => c.name);

  async function handleAdd(name: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user!.id).single();
    await supabase.from("master_categories").insert({
      name,
      company_id: profile?.company_id,
      is_active: true,
      sort_order: categories.length + 1,
    });
    await refresh();
  }

  async function handleDelete(name: string) {
    await supabase.from("master_categories").delete().eq("name", name);
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
