import javafx.application.Application;
import javafx.geometry.Insets;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.VBox;
import javafx.scene.layout.HBox;
import javafx.scene.layout.GridPane;
import javafx.stage.Stage;

public class InterfacciaGrafica extends Application {
    
    private ComboBox<String> tipoContenutoComboBox;
    private GridPane campiDinamiciPane;
    private TextField nomeField;
    private TextField descrizioneField;
    private TextField larghezzaField;
    private TextField altezzaField;
    private TextField fontField;
    private TextArea outputArea;
    private Archivio archivio;
    
    @Override
    public void start(Stage primaryStage) {
        archivio = new Archivio(10);
        
        primaryStage.setTitle("Gestione Contenuti Multimediali");
        
        VBox root = new VBox(10);
        root.setPadding(new Insets(15));
        
        // ComboBox per selezione tipo contenuto
        Label tipoLabel = new Label("Tipo Contenuto:");
        tipoContenutoComboBox = new ComboBox<>();
        tipoContenutoComboBox.getItems().addAll(
            "Immagine", "Audio", "Video", "DocumentoTesto"
        );
        tipoContenutoComboBox.setPromptText("Seleziona un tipo...");
        tipoContenutoComboBox.setOnAction(e -> aggiornaCampi());
        
        // Campi comuni
        nomeField = new TextField();
        nomeField.setPromptText("Nome");
        descrizioneField = new TextField();
        descrizioneField.setPromptText("Descrizione");
        
        // Pannello per campi dinamici
        campiDinamiciPane = new GridPane();
        campiDinamiciPane.setHgap(10);
        campiDinamiciPane.setVgap(10);
        
        // Pulsanti
        Button aggiungiButton = new Button("Aggiungi Contenuto");
        aggiungiButton.setOnAction(e -> aggiungiContenuto());
        
        Button eseguiButton = new Button("Esegui Tutti");
        eseguiButton.setOnAction(e -> eseguiTutti());
        
        // Area di output
        outputArea = new TextArea();
        outputArea.setEditable(false);
        outputArea.setPrefHeight(200);
        
        // Layout
        root.getChildren().addAll(
            tipoLabel, tipoContenutoComboBox,
            new Label("Nome:"), nomeField,
            new Label("Descrizione:"), descrizioneField,
            campiDinamiciPane,
            new HBox(10, aggiungiButton, eseguiButton),
            new Label("Risultati:"), outputArea
        );
        
        Scene scene = new Scene(root, 500, 600);
        primaryStage.setScene(scene);
        primaryStage.show();
    }
    
    private void aggiornaCampi() {
        campiDinamiciPane.getChildren().clear();
        
        String tipo = tipoContenutoComboBox.getValue();
        if (tipo == null) return;
        
        switch (tipo) {
            case "Immagine":
                larghezzaField = new TextField();
                larghezzaField.setPromptText("Larghezza");
                altezzaField = new TextField();
                altezzaField.setPromptText("Altezza");
                
                campiDinamiciPane.add(new Label("Larghezza:"), 0, 0);
                campiDinamiciPane.add(larghezzaField, 1, 0);
                campiDinamiciPane.add(new Label("Altezza:"), 0, 1);
                campiDinamiciPane.add(altezzaField, 1, 1);
                break;
                
            case "DocumentoTesto":
                fontField = new TextField();
                fontField.setPromptText("Font");
                
                campiDinamiciPane.add(new Label("Font:"), 0, 0);
                campiDinamiciPane.add(fontField, 1, 0);
                break;
                
            case "Audio":
            case "Video":
                Label infoLabel = new Label("Nessun campo aggiuntivo richiesto per " + tipo);
                campiDinamiciPane.add(infoLabel, 0, 0, 2, 1);
                break;
        }
    }
    
    private void aggiungiContenuto() {
        try {
            String nome = nomeField.getText().trim();
            String descrizione = descrizioneField.getText().trim();
            String tipo = tipoContenutoComboBox.getValue();
            
            if (nome.isEmpty() || descrizione.isEmpty() || tipo == null) {
                outputArea.setText("Errore: Compilare tutti i campi obbligatori");
                return;
            }
            
            Contenuto contenuto = null;
            
            switch (tipo) {
                case "Immagine":
                    int larghezza = Integer.parseInt(larghezzaField.getText());
                    int altezza = Integer.parseInt(altezzaField.getText());
                    contenuto = new Immagine(nome, descrizione, larghezza, altezza);
                    break;
                    
                case "Audio":
                    contenuto = new Audio(nome, descrizione);
                    break;
                    
                case "Video":
                    contenuto = new Video(nome, descrizione);
                    break;
                    
                case "DocumentoTesto":
                    String font = fontField.getText().trim();
                    contenuto = new DocumentoTesto(nome, descrizione, font);
                    break;
            }
            
            if (contenuto != null) {
                archivio.aggiungi(contenuto);
                outputArea.setText("Contenuto aggiunto con successo!\n" + contenuto.toString());
                pulisciCampi();
            }
            
        } catch (NumberFormatException e) {
            outputArea.setText("Errore: Inserire valori numerici validi per larghezza e altezza");
        } catch (Exception e) {
            outputArea.setText("Errore: " + e.getMessage());
        }
    }
    
    private void eseguiTutti() {
        String risultato = archivio.eseguiTutti();
        outputArea.setText(risultato);
    }
    
    private void pulisciCampi() {
        nomeField.clear();
        descrizioneField.clear();
        tipoContenutoComboBox.setValue(null);
        campiDinamiciPane.getChildren().clear();
    }
    
    public static void main(String[] args) {
        launch(args);
    }
}
