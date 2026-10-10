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

  // master_categories is a shared list with no company_id column; a failed insert is shown instead of ignored.
  async function handleAdd(name: string) {
    const { error } = await supabase.from("master_categories").insert({
      name,
      is_active: true,
      sort_order: categories.length + 1,
    });
    if (error) { alert("Couldn't add the category: " + error.message); return; }
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
