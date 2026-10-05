package com.thuraya.treasury.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Collections;

import javax.xml.parsers.DocumentBuilderFactory;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;

import com.thuraya.treasury.domain.PaymentInstruction;
import com.thuraya.treasury.domain.PaymentRun;
import com.thuraya.treasury.domain.RunStatus;

class BankFileWriterTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-02T06:30:00Z"), ZoneOffset.UTC);

    @TempDir
    Path folder;

    private static PaymentRun run(String bankFile) {
        return new PaymentRun("PR-2026-41", LocalDate.parse("2026-10-07"), RunStatus.AWAITING, 2, new BigDecimal("250000.50"),
                "u-rmenon", Instant.parse("2026-10-05T11:05:00Z"), "Host-to-Host (ISO 20022 pain.001)", bankFile);
    }

    @Test
    void writesAPain001CreditTransferFile() throws Exception {
        BankFileWriter writer = new BankFileWriter(folder.toString(), "Al Thuraya Holding Q.P.S.C.", CLOCK);

        Path file = writer.write(run("PAIN001_ATH_20261007_010.xml"), Arrays.asList(
                new PaymentInstruction("PR-2026-41", "AP-26-01530", "V-1006", "Doha Digital Systems W.L.L.", "PNB", "QA** 1234", new BigDecimal("150000.25"), LocalDate.parse("2026-10-08")),
                new PaymentInstruction("PR-2026-41", "AP-26-01533", "V-1009", "Al Wakrah Fresh Produce & Trading <W.L.L.>", "AMIB", "QA** 5678", new BigDecimal("100000.25"), LocalDate.parse("2026-10-09"))));

        assertThat(file).isEqualTo(folder.resolve("PAIN001_ATH_20261007_010.xml"));
        assertThat(Files.exists(folder.resolve("PAIN001_ATH_20261007_010.xml.tmp"))).isFalse();
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        Document xml = factory.newDocumentBuilder().parse(file.toFile());
        assertThat(xml.getDocumentElement().getNamespaceURI()).isEqualTo(BankFileWriter.NAMESPACE);
        assertThat(text(xml, "MsgId", 0)).isEqualTo("PR-2026-41");
        assertThat(text(xml, "NbOfTxs", 0)).isEqualTo("2");
        assertThat(text(xml, "CtrlSum", 0)).isEqualTo("250000.50");
        assertThat(text(xml, "ReqdExctnDt", 0)).isEqualTo("2026-10-07");
        assertThat(text(xml, "EndToEndId", 1)).isEqualTo("AP-26-01533");
        assertThat(text(xml, "Nm", 3)).isEqualTo("Al Wakrah Fresh Produce & Trading <W.L.L.>");
    }

    @Test
    void refusesFileNamesThatLeaveTheBankFileFolder() {
        BankFileWriter writer = new BankFileWriter(folder.toString(), "Al Thuraya Holding Q.P.S.C.", CLOCK);

        assertThatThrownBy(() -> writer.write(run("..\\..\\Windows\\evil.xml"), Collections.<PaymentInstruction>emptyList()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("unsafe");
    }

    private static String text(Document xml, String element, int index) {
        NodeList nodes = xml.getElementsByTagNameNS(BankFileWriter.NAMESPACE, element);
        return nodes.item(index).getTextContent();
    }
}
