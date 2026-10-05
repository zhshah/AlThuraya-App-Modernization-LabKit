package com.thuraya.treasury.service;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.regex.Pattern;

import javax.xml.stream.XMLOutputFactory;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamWriter;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.thuraya.treasury.domain.PaymentInstruction;
import com.thuraya.treasury.domain.PaymentRun;

/**
 * Writes the ISO 20022 customer credit transfer file (pain.001.001.03) for a payment run to the bank-file
 * folder, from where the host-to-host banking connector picks it up after the second (Treasury) approval.
 */
@Component
public class BankFileWriter {

    static final String NAMESPACE = "urn:iso:std:iso:20022:tech:xsd:pain.001.001.03";
    private static final Pattern SAFE_FILE_NAME = Pattern.compile("[A-Za-z0-9_.-]{1,80}\\.xml");

    private final Path directory;
    private final String debtorName;
    private final Clock clock;

    public BankFileWriter(@Value("${treasury.bank-file-dir}") String directory,
                          @Value("${treasury.debtor-name:Al Thuraya Holding Q.P.S.C.}") String debtorName,
                          Clock clock) {
        this.directory = Paths.get(directory);
        this.debtorName = debtorName;
        this.clock = clock;
    }

    public Path write(PaymentRun run, List<PaymentInstruction> instructions) {
        if (!SAFE_FILE_NAME.matcher(run.getBankFile()).matches()) {
            throw new IllegalStateException("Payment run " + run.getId() + " has an unsafe bank file name");
        }
        BigDecimal total = instructions.stream().map(PaymentInstruction::getAmountQar).reduce(BigDecimal.ZERO, BigDecimal::add);
        try {
            Files.createDirectories(directory);
            Path target = directory.resolve(run.getBankFile());
            Path temporary = directory.resolve(run.getBankFile() + ".tmp");
            try (OutputStream out = Files.newOutputStream(temporary)) {
                XMLStreamWriter xml = XMLOutputFactory.newInstance().createXMLStreamWriter(out, "UTF-8");
                writeDocument(xml, run, instructions, total);
                xml.flush();
                xml.close();
            }
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
            return target;
        }
        catch (IOException e) {
            throw new UncheckedIOException("Could not write the bank file for payment run " + run.getId(), e);
        }
        catch (XMLStreamException e) {
            throw new IllegalStateException("Could not write the bank file for payment run " + run.getId(), e);
        }
    }

    private void writeDocument(XMLStreamWriter xml, PaymentRun run, List<PaymentInstruction> instructions, BigDecimal total) throws XMLStreamException {
        String created = Instant.now(clock).truncatedTo(ChronoUnit.SECONDS).toString();
        String count = String.valueOf(instructions.size());
        xml.writeStartDocument("UTF-8", "1.0");
        xml.setDefaultNamespace(NAMESPACE);
        xml.writeStartElement(NAMESPACE, "Document");
        xml.writeDefaultNamespace(NAMESPACE);
        xml.writeStartElement(NAMESPACE, "CstmrCdtTrfInitn");

        xml.writeStartElement(NAMESPACE, "GrpHdr");
        text(xml, "MsgId", run.getId());
        text(xml, "CreDtTm", created);
        text(xml, "NbOfTxs", count);
        text(xml, "CtrlSum", total.toPlainString());
        xml.writeStartElement(NAMESPACE, "InitgPty");
        text(xml, "Nm", debtorName);
        xml.writeEndElement();
        xml.writeEndElement();

        xml.writeStartElement(NAMESPACE, "PmtInf");
        text(xml, "PmtInfId", run.getId() + "-001");
        text(xml, "PmtMtd", "TRF");
        text(xml, "NbOfTxs", count);
        text(xml, "CtrlSum", total.toPlainString());
        text(xml, "ReqdExctnDt", run.getValueDate().toString());
        xml.writeStartElement(NAMESPACE, "Dbtr");
        text(xml, "Nm", debtorName);
        xml.writeEndElement();
        for (PaymentInstruction instruction : instructions) {
            xml.writeStartElement(NAMESPACE, "CdtTrfTxInf");
            xml.writeStartElement(NAMESPACE, "PmtId");
            text(xml, "EndToEndId", instruction.getInvoiceId());
            xml.writeEndElement();
            xml.writeStartElement(NAMESPACE, "Amt");
            xml.writeStartElement(NAMESPACE, "InstdAmt");
            xml.writeAttribute("Ccy", "QAR");
            xml.writeCharacters(instruction.getAmountQar().toPlainString());
            xml.writeEndElement();
            xml.writeEndElement();
            xml.writeStartElement(NAMESPACE, "Cdtr");
            text(xml, "Nm", instruction.getBeneficiary());
            xml.writeEndElement();
            xml.writeStartElement(NAMESPACE, "CdtrAcct");
            xml.writeStartElement(NAMESPACE, "Id");
            text(xml, "Othr", instruction.getIbanMasked());
            xml.writeEndElement();
            xml.writeEndElement();
            xml.writeStartElement(NAMESPACE, "RmtInf");
            text(xml, "Ustrd", instruction.getInvoiceId() + " / " + instruction.getVendorId());
            xml.writeEndElement();
            xml.writeEndElement();
        }
        xml.writeEndElement();

        xml.writeEndElement();
        xml.writeEndElement();
        xml.writeEndDocument();
    }

    private static void text(XMLStreamWriter xml, String name, String value) throws XMLStreamException {
        xml.writeStartElement(NAMESPACE, name);
        xml.writeCharacters(value == null ? "" : value);
        xml.writeEndElement();
    }
}
