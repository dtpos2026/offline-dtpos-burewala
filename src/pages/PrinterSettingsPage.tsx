import PrinterSettingsPanel from '@/components/PrinterSettingsPanel';
import PrintMarginsCard from '@/components/PrintMarginsCard';
import PrintAlignmentTestCard from '@/components/PrintAlignmentTestCard';
import SlipMarginsCard from '@/components/SlipMarginsCard';
import FastBillingModeCard from '@/components/FastBillingModeCard';
import PrintQualityCard from '@/components/PrintQualityCard';
import TestPrintCard from '@/components/TestPrintCard';
import TokenSettingsCard from '@/components/TokenSettingsCard';
import TokenRulesCard from '@/components/TokenRulesCard';
import PrinterCalibrationPanel from '@/components/PrinterCalibrationPanel';
import PrinterHealthCard from '@/components/PrinterHealthCard';
import ReceiptTemplateCard from '@/components/ReceiptTemplateCard';
import PremiumTemplateGallery from '@/components/PremiumTemplateGallery';

export default function PrinterSettingsPage() {
  return (
    <div className="container max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Printer Settings</h1>
        <p className="text-sm text-muted-foreground">
          Counter, kitchen, delivery printers — and cloud silent print server for Windows EXE.
        </p>
      </div>
      <PrinterHealthCard />
      <FastBillingModeCard />
      <ReceiptTemplateCard />
      <PremiumTemplateGallery />
      <PrintMarginsCard />
      <SlipMarginsCard />
      <PrintAlignmentTestCard />
      <PrintQualityCard />
      <PrinterCalibrationPanel />
      <TestPrintCard />
      <TokenSettingsCard />
      <TokenRulesCard />
      <PrinterSettingsPanel />
    </div>
  );
}
