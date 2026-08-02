import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const QUICK_OPTIONS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "last_7_days" },
  { label: "Last 30 days", value: "last_30_days" },
  { label: "This month", value: "this_month" },
  { label: "This year", value: "this_year" },
  { label: "All time", value: "all_time" },
];

export default function DateRangePicker({ onRangeChange }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("quick"); // "quick" | "month" | "custom"
  const [selectedQuick, setSelectedQuick] = useState("last_30_days");
  
  const [year, setYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(null); // 0..11
  
  const [fromDate, setFromDate] = useState("2026-07-04");
  const [toDate, setToDate] = useState("2026-08-02");

  const [label, setLabel] = useState("Last 30 days");

  const handleSelectQuick = (opt) => {
    setSelectedQuick(opt.value);
    setLabel(opt.label);
    setOpen(false);
    if (onRangeChange) {
      onRangeChange({ type: "quick", value: opt.value, label: opt.label });
    }
  };

  const handleSelectMonth = (idx) => {
    setSelectedMonth(idx);
    const monthName = MONTHS[idx];
    const displayLabel = `${monthName} ${year}`;
    setLabel(displayLabel);
    setOpen(false);
    if (onRangeChange) {
      onRangeChange({ type: "month", year, month: idx, label: displayLabel });
    }
  };

  const handleApplyCustom = () => {
    if (!fromDate || !toDate) return;
    const displayLabel = `${fromDate} to ${toDate}`;
    setLabel(displayLabel);
    setOpen(false);
    if (onRangeChange) {
      onRangeChange({ type: "custom", from: fromDate, to: toDate, label: displayLabel });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-testid="date-range-picker-trigger"
          className="h-9 px-3 text-xs font-mono bg-white/[0.04] border-white/10 hover:bg-white/[0.08] text-white flex items-center gap-2 rounded-md"
        >
          <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" />
          <span>{label}</span>
          <ChevronDown className="w-3 h-3 text-white/50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 bg-white text-neutral-900 border border-neutral-200 shadow-2xl rounded-xl overflow-hidden font-sans"
      >
        {/* Tab Headers */}
        <div className="flex border-b border-neutral-200 text-xs font-bold font-mono tracking-wider">
          <button
            onClick={() => setActiveTab("quick")}
            className={`flex-1 py-3 text-center transition-colors relative ${
              activeTab === "quick" ? "text-blue-600 font-extrabold" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            QUICK
            {activeTab === "quick" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("month")}
            className={`flex-1 py-3 text-center transition-colors relative ${
              activeTab === "month" ? "text-blue-600 font-extrabold" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            MONTH
            {activeTab === "month" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("custom")}
            className={`flex-1 py-3 text-center transition-colors relative ${
              activeTab === "custom" ? "text-blue-600 font-extrabold" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            CUSTOM
            {activeTab === "custom" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>
        </div>

        {/* Tab 1: QUICK */}
        {activeTab === "quick" && (
          <div className="p-2 space-y-0.5">
            {QUICK_OPTIONS.map((opt) => {
              const selected = selectedQuick === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSelectQuick(opt)}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                    selected
                      ? "bg-blue-50 text-blue-600 font-semibold"
                      : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Tab 2: MONTH */}
        {activeTab === "month" && (
          <div className="p-4 space-y-4">
            {/* Year Selector */}
            <div className="flex items-center justify-between px-2">
              <button
                onClick={() => setYear((y) => y - 1)}
                className="p-1 text-neutral-400 hover:text-neutral-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-display font-black text-lg text-neutral-900">{year}</span>
              <button
                onClick={() => setYear((y) => y + 1)}
                className="p-1 text-neutral-400 hover:text-neutral-800 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* 12-Month Grid */}
            <div className="grid grid-cols-4 gap-2 text-center text-sm">
              {MONTHS.map((m, idx) => {
                const isSelected = selectedMonth === idx;
                return (
                  <button
                    key={m}
                    onClick={() => handleSelectMonth(idx)}
                    className={`py-2 rounded-lg transition-colors text-xs font-semibold ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-md"
                        : "text-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: CUSTOM */}
        {activeTab === "custom" && (
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-[10.5px] font-mono font-bold uppercase tracking-wider text-neutral-500 mb-1">
                FROM DATE
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full h-10 px-3 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[10.5px] font-mono font-bold uppercase tracking-wider text-neutral-500 mb-1">
                TO DATE
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full h-10 px-3 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <Button
              onClick={handleApplyCustom}
              className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg shadow-md transition-all"
            >
              Apply Range
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
