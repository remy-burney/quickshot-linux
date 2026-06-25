using System.Text.Json.Serialization;

namespace LightshotLinux.ImageTool;

public sealed class ExportRequest
{
    [JsonPropertyName("selection")]
    public SelectionRect Selection { get; set; } = new();

    [JsonPropertyName("annotations")]
    public List<Annotation> Annotations { get; set; } = [];
}

public sealed class SelectionRect
{
    [JsonPropertyName("x")]
    public float X { get; set; }

    [JsonPropertyName("y")]
    public float Y { get; set; }

    [JsonPropertyName("width")]
    public float Width { get; set; }

    [JsonPropertyName("height")]
    public float Height { get; set; }
}

public sealed class Annotation
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("color")]
    public string Color { get; set; } = "#ff0000";

    [JsonPropertyName("size")]
    public float Size { get; set; } = 3;

    [JsonPropertyName("x")]
    public float X { get; set; }

    [JsonPropertyName("y")]
    public float Y { get; set; }

    [JsonPropertyName("x2")]
    public float X2 { get; set; }

    [JsonPropertyName("y2")]
    public float Y2 { get; set; }

    [JsonPropertyName("width")]
    public float Width { get; set; }

    [JsonPropertyName("height")]
    public float Height { get; set; }

    [JsonPropertyName("text")]
    public string? Text { get; set; }

    [JsonPropertyName("fontSize")]
    public float FontSize { get; set; } = 24;

    [JsonPropertyName("points")]
    public List<AnnotationPoint> Points { get; set; } = [];
}

public sealed class AnnotationPoint
{
    [JsonPropertyName("x")]
    public float X { get; set; }

    [JsonPropertyName("y")]
    public float Y { get; set; }
}
